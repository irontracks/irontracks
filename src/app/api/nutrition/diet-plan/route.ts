import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { respondDbError } from '@/utils/api/dbError'
import { parseJsonBody } from '@/utils/zod'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { logError } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/* ──────────────────────────────────────────────────────────
 * /api/nutrition/diet-plan — o plano que o PRÓPRIO usuário salvou.
 *
 * Até 03/08/2026 a dieta gerada em `ai/diet-generate` era efêmera: gerava, mostrava
 * e sumia ao fechar a tela — não dava pra seguir o cardápio no dia seguinte. Só o
 * professor tinha persistência (`teacher/diet/prescribe`).
 *
 * Mesma tabela do plano prescrito, separados por `created_by`:
 *   created_by = user_id  → plano PRÓPRIO (esta rota, editável)
 *   created_by ≠ user_id  → prescrito pelo professor (rota prescribed-plan, read-only)
 * A policy `student_diet_plans_own_write` só deixa escrever com os dois iguais, então
 * não dá pra forjar um plano que pareça do professor.
 *
 * GET    → plano próprio ativo (ou null)
 * POST   → salva/substitui (um plano próprio ativo por vez)
 * DELETE → arquiva o ativo
 * ────────────────────────────────────────────────────────── */

const MacroSchema = z.object({
  calories: z.number().nonnegative().max(20_000),
  protein: z.number().nonnegative().max(2_000),
  carbs: z.number().nonnegative().max(4_000),
  fat: z.number().nonnegative().max(2_000),
})

const ItemSchema = z.object({
  food: z.string().trim().min(1).max(120),
  grams: z.number().nonnegative().max(5_000),
  calories: z.number().nonnegative().max(5_000),
  protein: z.number().nonnegative().max(500),
  carbs: z.number().nonnegative().max(1_000),
  fat: z.number().nonnegative().max(500),
})

const MealSchema = z.object({
  name: z.string().trim().min(1).max(60),
  time: z.string().trim().max(10).optional(),
  items: z.array(ItemSchema).min(1).max(20),
  totals: MacroSchema.optional(),
})

const DaySchema = z.object({
  weekday: z.number().int().min(0).max(6).optional(),
  meals: z.array(MealSchema).min(1).max(10),
})

/**
 * Aceita plano de dia (`meals`) OU de semana (`days`), nunca os dois — o formato é
 * o mesmo que `planDays()` lê do outro lado. Os tetos existem porque isto vira uma
 * linha jsonb: sem limite, um payload forjado engordaria a tabela sem parar.
 */
const BodySchema = z
  .object({
    planName: z.string().trim().min(1).max(120).optional(),
    notes: z.string().trim().max(500).optional(),
    meals: z.array(MealSchema).min(1).max(10).optional(),
    days: z.array(DaySchema).min(1).max(7).optional(),
  })
  .strip()
  .refine((b) => Boolean(b.meals) !== Boolean(b.days), {
    message: 'Envie meals (plano de dia) OU days (plano de semana), não ambos.',
  })

const SELECT = 'id, plan_name, plan_kind, meals, days, notes, created_at, updated_at'

export async function GET() {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response
    const userId = String(auth.user.id || '').trim()

    const { data, error } = await auth.supabase
      .from('student_diet_plans')
      .select(SELECT)
      .eq('user_id', userId)
      .eq('created_by', userId)
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) return respondDbError('nutrition:diet-plan:get', error)

    return NextResponse.json({ ok: true, plan: data ?? null })
  } catch (e: unknown) {
    logError('nutrition:diet-plan:get', e)
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response
    const userId = String(auth.user.id || '').trim()

    const ip = getRequestIp(req)
    const rl = await checkRateLimitAsync(`nutrition:diet-plan:save:${userId}:${ip}`, 20, 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

    const parsed = await parseJsonBody(req, BodySchema)
    if (parsed.response || !parsed.data) {
      return parsed.response ?? NextResponse.json({ ok: false, error: 'Invalid input' }, { status: 400 })
    }
    const body = parsed.data

    const isWeek = Boolean(body.days)
    const planName = body.planName || (isWeek ? 'Meu plano da semana' : 'Minha dieta')

    // Arquiva o anterior ANTES de inserir o novo: só um plano próprio ativo por vez,
    // e o arquivamento não apaga histórico (status='archived', a linha fica).
    const { error: archiveError } = await auth.supabase
      .from('student_diet_plans')
      .update({ status: 'archived', updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('created_by', userId)
      .eq('status', 'active')
    if (archiveError) return respondDbError('nutrition:diet-plan:archive', archiveError)

    const { data, error } = await auth.supabase
      .from('student_diet_plans')
      .insert({
        user_id: userId,
        created_by: userId, // = user_id: é o que marca "plano meu" e o que a policy exige
        plan_name: planName,
        plan_kind: isWeek ? 'week' : 'day',
        meals: isWeek ? [] : (body.meals ?? []),
        days: isWeek ? body.days : null,
        notes: body.notes || null,
        status: 'active',
      })
      .select(SELECT)
      .single()
    if (error) return respondDbError('nutrition:diet-plan:insert', error)

    return NextResponse.json({ ok: true, plan: data })
  } catch (e: unknown) {
    logError('nutrition:diet-plan:post', e)
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response
    const userId = String(auth.user.id || '').trim()

    // Arquiva em vez de apagar — o usuário pode querer o histórico do que seguiu.
    const { error } = await auth.supabase
      .from('student_diet_plans')
      .update({ status: 'archived', updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('created_by', userId)
      .eq('status', 'active')
    if (error) return respondDbError('nutrition:diet-plan:delete', error)

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    logError('nutrition:diet-plan:delete', e)
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 })
  }
}
