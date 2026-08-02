import { NextResponse } from 'next/server'
import { z } from 'zod'
import { parseJsonBody } from '@/utils/zod'
import { requireRole } from '@/utils/auth/route'
import { canCoachStudent } from '@/utils/auth/studentAccess'
import { checkRateLimitAsync } from '@/utils/rateLimit'
// NEEDS ADMIN: gera com o repertório do ALUNO e grava o plano na conta dele (cross-user).
import { createAdminClient } from '@/utils/supabase/admin'
import { checkVipFeatureAccess, incrementVipUsage } from '@/utils/vip/limits'
import { handleGeminiError } from '@/utils/ai/handleGeminiError'
import { generateDietPlan, DietGenerateError } from '@/lib/nutrition/dietGenerate'
import { logError } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // geração de cardápio no Gemini pode passar dos 30s padrão

/* ──────────────────────────────────────────────────────────
 * POST /api/teacher/diet/prescribe
 *
 * O professor prescreve um plano alimentar PRO ALUNO. Mesmo motor do self-service
 * (generateDietPlan), mas a origem dos dados é o aluno e o plano é PERSISTIDO em
 * student_diet_plans (o self-service é efêmero). Gate canCoachStudent (só aluno DELE,
 * anti-IDOR) + cota na conta do professor. Escrita via service-role (o aluno só tem SELECT
 * na tabela; nunca INSERT/UPDATE — mesmo modelo das tabelas de VIP/periodização).
 * ────────────────────────────────────────────────────────── */

const BodySchema = z
  .object({
    studentId: z.string().min(1),
    calories: z.number().positive().max(10_000),
    protein: z.coerce.number().nonnegative().max(1_000),
    carbs: z.coerce.number().nonnegative().max(2_000),
    fat: z.coerce.number().nonnegative().max(1_000),
    meals: z.number().int().min(3).max(7).optional().default(5),
    // Instruções do professor: viram dica pra IA E ficam salvas como recado pro aluno.
    notes: z.string().transform((s) => s.slice(0, 300)).optional(),
    planName: z.string().transform((s) => s.slice(0, 80)).optional(),
  })
  .strip()

export async function POST(req: Request) {
  try {
    const auth = await requireRole(['admin', 'teacher'])
    if (!auth.ok) return auth.response
    const teacherId = String(auth.user.id || '').trim()

    const parsed = await parseJsonBody(req, BodySchema)
    if (parsed.response) return parsed.response
    const body = parsed.data as z.infer<typeof BodySchema>
    const studentId = String(body.studentId || '').trim()

    // Só o professor DAQUELE aluno (ou admin) prescreve dieta pra ele.
    if (!(await canCoachStudent({ id: teacherId, email: auth.user.email }, studentId))) {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
    }

    // Cota conta na conta de QUEM gera (o professor).
    const { allowed, limit, tier } = await checkVipFeatureAccess(auth.supabase, teacherId, 'insights_weekly')
    if (!allowed) {
      return NextResponse.json(
        { ok: false, error: 'vip_required', upgradeRequired: true, message: `Limite de ${limit} (${tier}). Upgrade necessário.` },
        { status: 403 },
      )
    }

    const rl = await checkRateLimitAsync(`teacher-diet:${teacherId}`, 10, 3_600_000)
    if (!rl.allowed) {
      return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } })
    }

    const admin = createAdminClient()

    const outcome = await generateDietPlan(admin, {
      sourceUserId: studentId,   // gera com o repertório/contexto do ALUNO
      targets: { calories: body.calories, protein: body.protein, carbs: body.carbs, fat: body.fat },
      mealsCount: body.meals,
      notes: body.notes,
    })
    if (!outcome.ok) return outcome.errorResponse

    const planName = (body.planName || outcome.plan.planName || 'Plano alimentar').slice(0, 80)

    // Insere PRIMEIRO, depois arquiva os anteriores. Se invertesse (arquiva→insere) e o
    // insert falhasse, o aluno ficaria SEM plano ativo (perda silenciosa). Como as leituras
    // pegam o mais recente (order created_at desc, limit 1), a janela com dois "active"
    // devolve o novo — e um insert falho preserva o plano antigo.
    const { data: inserted, error: insErr } = await admin
      .from('student_diet_plans')
      .insert({
        user_id: studentId,     // dono = aluno
        created_by: teacherId,  // autor = professor
        plan_name: planName,
        meals: outcome.plan.meals,
        notes: body.notes || null,
        status: 'active',
      })
      .select('id')
      .single()
    // Loga o erro cru no Sentry mas NUNCA devolve ao cliente (vazaria schema/RLS).
    if (insErr) { logError('teacher-diet:insert', insErr); return NextResponse.json({ ok: false, error: 'database_error' }, { status: 500 }) }

    // Arquiva os planos ativos ANTERIORES (um plano ativo por aluno). Best-effort: se falhar,
    // ainda há dois "active", mas as leituras devolvem o novo (mais recente) — sem perda.
    const newPlanId = String(inserted?.id || '').trim()
    if (newPlanId) {
      const { error: archErr } = await admin
        .from('student_diet_plans')
        .update({ status: 'archived', updated_at: new Date().toISOString() })
        .eq('user_id', studentId)
        .eq('status', 'active')
        .neq('id', newPlanId)
      if (archErr) logError('teacher-diet:archive', archErr)
    }

    await incrementVipUsage(auth.supabase, teacherId, 'insights')

    return NextResponse.json({
      ok: true,
      planId: inserted?.id ?? null,
      plan: { planName, meals: outcome.plan.meals, totals: outcome.plan.totals, target: outcome.plan.target, adherence: outcome.plan.adherence },
    })
  } catch (e: unknown) {
    if (e instanceof DietGenerateError) {
      return NextResponse.json({ ok: false, error: e.code }, { status: 500 })
    }
    return handleGeminiError('teacher-diet-prescribe', e)
  }
}
