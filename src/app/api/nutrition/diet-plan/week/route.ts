import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { respondDbError } from '@/utils/api/dbError'
import { parseJsonBody } from '@/utils/zod'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { logError } from '@/lib/logger'
import { buildSwapCandidates } from '@/lib/nutrition/swapCandidates'
import { buildWeekFromDay } from '@/lib/nutrition/weekPlan'

export const dynamic = 'force-dynamic'

/* ──────────────────────────────────────────────────────────
 * POST /api/nutrition/diet-plan/week
 *
 * Recebe o cardápio de UM dia (o que a IA gerou) e salva um plano da SEMANA,
 * derivando os outros 6 dias com o motor de troca — sem nova chamada de IA.
 * Ver lib/nutrition/weekPlan pro porquê de não gerar 7 dias no Gemini.
 *
 * Substitui o plano próprio ativo, igual à rota de salvar plano de dia: um plano
 * ativo por vez, e o anterior vira 'archived' em vez de sumir.
 * ────────────────────────────────────────────────────────── */

const ItemSchema = z.object({
  food: z.string().trim().min(1).max(120),
  grams: z.number().nonnegative().max(5_000),
  calories: z.number().nonnegative().max(5_000),
  protein: z.number().nonnegative().max(500),
  carbs: z.number().nonnegative().max(1_000),
  fat: z.number().nonnegative().max(500),
})

const BodySchema = z
  .object({
    planName: z.string().trim().min(1).max(120).optional(),
    notes: z.string().trim().max(500).optional(),
    meals: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(60),
          time: z.string().trim().max(10).optional(),
          items: z.array(ItemSchema).min(1).max(20),
        }),
      )
      .min(1)
      .max(10),
  })
  .strip()

const SELECT = 'id, plan_name, plan_kind, meals, days, notes, created_at, updated_at'

export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response
    const userId = String(auth.user.id || '').trim()

    const ip = getRequestIp(req)
    const rl = await checkRateLimitAsync(`nutrition:diet-plan:week:${userId}:${ip}`, 20, 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

    const parsed = await parseJsonBody(req, BodySchema)
    if (parsed.response || !parsed.data) {
      return parsed.response ?? NextResponse.json({ ok: false, error: 'Invalid input' }, { status: 400 })
    }
    const body = parsed.data

    const baseMeals = body.meals.map((m) => ({
      name: m.name,
      ...(m.time ? { time: m.time } : {}),
      items: m.items,
      totals: m.items.reduce(
        (acc, it) => ({
          calories: acc.calories + it.calories,
          protein: acc.protein + it.protein,
          carbs: acc.carbs + it.carbs,
          fat: acc.fat + it.fat,
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0 },
      ),
    }))

    const candidates = await buildSwapCandidates(auth.supabase, userId)
    const days = buildWeekFromDay(baseMeals, candidates)
    if (!days.length) return NextResponse.json({ ok: false, error: 'empty_plan' }, { status: 400 })

    const { error: archiveError } = await auth.supabase
      .from('student_diet_plans')
      .update({ status: 'archived', updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('created_by', userId)
      .eq('status', 'active')
    if (archiveError) return respondDbError('nutrition:diet-plan:week:archive', archiveError)

    const { data, error } = await auth.supabase
      .from('student_diet_plans')
      .insert({
        user_id: userId,
        created_by: userId,
        plan_name: body.planName || 'Meu plano da semana',
        plan_kind: 'week',
        meals: [],
        days: days.map((d) => ({ weekday: d.weekday, meals: d.meals })),
        notes: body.notes || null,
        status: 'active',
      })
      .select(SELECT)
      .single()
    if (error) return respondDbError('nutrition:diet-plan:week:insert', error)

    return NextResponse.json({ ok: true, plan: data })
  } catch (e: unknown) {
    logError('nutrition:diet-plan:week', e)
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 })
  }
}
