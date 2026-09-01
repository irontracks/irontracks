import { NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { notifyCoachChange } from '@/lib/notifications/coachChangeNotice'
import { z } from 'zod'
import { parseJsonBody } from '@/utils/zod'
import { requireRole } from '@/utils/auth/route'
import { canCoachStudent } from '@/utils/auth/studentAccess'
import { checkRateLimitAsync } from '@/utils/rateLimit'
// NEEDS ADMIN: escreve no plano da conta do ALUNO (cross-user). Ele só tem SELECT
// nessa tabela — mesmo modelo do prescribe.
import { createAdminClient } from '@/utils/supabase/admin'
import { MAX_NOTA_DA_REFEICAO } from '@/lib/nutrition/dietPlanShape'
import { logError } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/* ──────────────────────────────────────────────────────────
 * POST /api/teacher/diet/note
 *
 * A orientação do professor em UMA refeição do plano que ele prescreveu
 * ("mastigar devagar", "se não tiver frango, atum"). O aluno lê no card
 * `PrescribedDietPlan` e não edita.
 *
 * Existe porque a rota do aluno (`/api/nutrition/diet-plan/note`) exige plano
 * PRÓPRIO (`created_by = user_id`) de propósito. Aqui é o espelho: exige que o
 * plano seja DO PROFESSOR (`created_by = teacherId`) — sem isso, um coach
 * escreveria dentro da dieta que o próprio aluno montou.
 *
 * ⚠️ Lê `meals` CRU e altera por spread, sem passar por `planDays()`. O parser
 * reconstrói a refeição campo a campo e descarta o que não declara; numa escrita
 * cirúrgica como esta, o spread preserva qualquer campo que o gerador tenha
 * gravado. (A rota do aluno usa `planDays` porque precisa lidar com plano de
 * semana; o do professor é sempre de um dia.)
 * ────────────────────────────────────────────────────────── */

const BodySchema = z
  .object({
    studentId: z.string().min(1),
    mealIndex: z.number().int().min(0).max(19),
    /** Vazio APAGA a orientação — é como o professor desfaz. */
    note: z.string().max(MAX_NOTA_DA_REFEICAO),
  })
  .strip()

type RefeicaoCrua = Record<string, unknown>

export async function POST(req: Request) {
  try {
    const auth = await requireRole(['admin', 'teacher'])
    if (!auth.ok) return auth.response
    const teacherId = String(auth.user.id || '').trim()

    const parsed = await parseJsonBody(req, BodySchema)
    if (parsed.response) return parsed.response
    const body = parsed.data as z.infer<typeof BodySchema>
    const studentId = String(body.studentId || '').trim()
    const note = body.note.trim().slice(0, MAX_NOTA_DA_REFEICAO)

    // Só o professor DAQUELE aluno (ou admin) — mesmo gate anti-IDOR do prescribe.
    if (!(await canCoachStudent({ id: teacherId, email: auth.user.email }, studentId))) {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
    }

    const rl = await checkRateLimitAsync(`teacher-diet-note:${teacherId}`, 60, 60_000)
    if (!rl.allowed) {
      return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } })
    }

    const admin = createAdminClient()
    const { data: row, error: readError } = await admin
      .from('student_diet_plans')
      .select('id, meals, created_by')
      .eq('user_id', studentId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (readError) { logError('teacher-diet-note:read', readError); return NextResponse.json({ ok: false, error: 'database_error' }, { status: 500 }) }
    if (!row) return NextResponse.json({ ok: false, error: 'plan_not_found' }, { status: 404 })

    // O plano ATIVO do aluno pode ser o que ele mesmo montou. Anotar ali seria
    // escrever dentro da dieta dele — o espelho exato da regra que impede o
    // aluno de editar a prescrição.
    if (String(row.created_by || '') === studentId) {
      return NextResponse.json({ ok: false, error: 'plan_is_students_own' }, { status: 409 })
    }

    const meals = Array.isArray(row.meals) ? (row.meals as RefeicaoCrua[]) : []
    if (!meals[body.mealIndex]) return NextResponse.json({ ok: false, error: 'meal_not_found' }, { status: 404 })

    const nextMeals = meals.map((m, i) => {
      if (i !== body.mealIndex) return m
      // Nota vazia REMOVE a chave em vez de gravar "" — o card do aluno trata
      // ausente e vazio igual, e a chave vazia só engordaria o plano.
      const { note: _antiga, ...semNota } = m
      return note ? { ...semNota, note } : semNota
    })

    const { error: updateError } = await admin
      .from('student_diet_plans')
      .update({ meals: nextMeals, updated_at: new Date().toISOString() })
      .eq('id', row.id)
      .eq('user_id', studentId)
    if (updateError) { logError('teacher-diet-note:update', updateError); return NextResponse.json({ ok: false, error: 'database_error' }, { status: 500 }) }

    // Aviso ao aluno — depois da escrita CONFIRMADA, e best-effort: a orientação
    // já está gravada, e falhar o push não pode devolver erro ao professor.
    // A janela de agrupamento do módulo é o que impede seis refeições anotadas
    // em sequência virarem seis pushes.
    waitUntil(
      notifyCoachChange({ studentUserId: studentId, kind: 'diet_updated', origem: 'diet_note' })
        .catch(() => { }),
    )

    return NextResponse.json({ ok: true, meals: nextMeals })
  } catch (e: unknown) {
    logError('teacher-diet-note:post', e)
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 })
  }
}
