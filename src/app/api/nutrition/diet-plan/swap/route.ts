import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { respondDbError } from '@/utils/api/dbError'
import { parseJsonBody } from '@/utils/zod'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { logError } from '@/lib/logger'
import { buildSwapCandidates } from '@/lib/nutrition/swapCandidates'
import { buildUserFoodMealMap } from '@/lib/nutrition/mealItemFoods'
import { mealGroupOf } from '@/lib/nutrition/mealContext'
import { swapFood } from '@/lib/nutrition/foodSwap'
import { planDays, type PlanDay, type PlanMeal } from '@/lib/nutrition/dietPlanShape'

export const dynamic = 'force-dynamic'

/* ──────────────────────────────────────────────────────────
 * POST /api/nutrition/diet-plan/swap
 *
 * "Gerou macarrão e eu não quero": troca UM item do plano salvo por outro da mesma
 * classe e PERSISTE na hora — o usuário não precisa lembrar de salvar de novo
 * (item 4 do pedido). Sem IA: a escolha sai do repertório do próprio usuário +
 * base curada, então é instantânea e não custa chamada paga. Ver lib/nutrition/foodSwap.
 *
 * Só mexe em plano PRÓPRIO (created_by = user_id). Plano prescrito pelo professor é
 * somente leitura — trocar ali seria alterar a prescrição de outra pessoa.
 * ────────────────────────────────────────────────────────── */

const BodySchema = z
  .object({
    /** Índice do dia (0 em plano de um dia só). */
    dayIndex: z.number().int().min(0).max(6).default(0),
    mealIndex: z.number().int().min(0).max(19),
    itemIndex: z.number().int().min(0).max(19),
    /** Alimentos já recusados nesta troca — clicar de novo traz outro, não o mesmo. */
    reject: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
  })
  .strip()

const SELECT = 'id, plan_name, plan_kind, meals, days, notes, created_at, updated_at'

export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response
    const userId = String(auth.user.id || '').trim()

    const ip = getRequestIp(req)
    const rl = await checkRateLimitAsync(`nutrition:diet-plan:swap:${userId}:${ip}`, 60, 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

    const parsed = await parseJsonBody(req, BodySchema)
    if (parsed.response || !parsed.data) {
      return parsed.response ?? NextResponse.json({ ok: false, error: 'Invalid input' }, { status: 400 })
    }
    const { dayIndex, mealIndex, itemIndex, reject } = parsed.data

    const { data: row, error: readError } = await auth.supabase
      .from('student_diet_plans')
      .select(SELECT)
      .eq('user_id', userId)
      .eq('created_by', userId)
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (readError) return respondDbError('nutrition:diet-plan:swap:read', readError)
    if (!row) return NextResponse.json({ ok: false, error: 'plan_not_found' }, { status: 404 })

    const days = planDays(row)
    const day = days[dayIndex]
    const meal = day?.meals?.[mealIndex]
    const item = meal?.items?.[itemIndex]
    if (!item) return NextResponse.json({ ok: false, error: 'item_not_found' }, { status: 404 })

    const [candidates, foodMealMap] = await Promise.all([
      buildSwapCandidates(auth.supabase, userId),
      buildUserFoodMealMap(auth.supabase, userId),
    ])
    const swapped = swapFood(item, candidates, {
      // O resto da refeição entra no exclude: trocar arroz por feijão quando já tem
      // feijão no prato deixaria o mesmo alimento duas vezes.
      exclude: [...meal.items.map((i) => i.food), ...(reject ?? [])],
      // Nome da refeição ("Almoço", "Café da Manhã") decide o que cabe ali.
      mealGroup: mealGroupOf(meal.name),
      foodMealMap,
    })
    if (!swapped) {
      return NextResponse.json({ ok: false, error: 'no_alternative' }, { status: 409 })
    }

    const nextDays: PlanDay[] = days.map((d, di) =>
      di !== dayIndex
        ? d
        : {
            ...d,
            meals: d.meals.map((m: PlanMeal, mi) =>
              mi !== mealIndex
                ? m
                : {
                    ...m,
                    items: m.items.map((it, ii) =>
                      ii !== itemIndex
                        ? it
                        : {
                            food: swapped.food,
                            grams: swapped.grams,
                            calories: swapped.calories,
                            protein: swapped.protein,
                            carbs: swapped.carbs,
                            fat: swapped.fat,
                          },
                    ),
                  },
            ),
          },
    )

    // Grava no MESMO formato em que o plano já estava: um plano de dia não vira
    // semana só porque um alimento mudou.
    const isWeek = String(row.plan_kind || '') === 'week' || days.length > 1
    const payload = isWeek
      ? { days: nextDays.map((d) => ({ ...(d.weekday !== undefined ? { weekday: d.weekday } : {}), meals: d.meals })) }
      : { meals: nextDays[0]?.meals ?? [] }

    const { data: updated, error: updateError } = await auth.supabase
      .from('student_diet_plans')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', row.id)
      .eq('user_id', userId)
      .eq('created_by', userId)
      .select(SELECT)
      .single()
    if (updateError) return respondDbError('nutrition:diet-plan:swap:update', updateError)

    return NextResponse.json({ ok: true, plan: updated, swapped })
  } catch (e: unknown) {
    logError('nutrition:diet-plan:swap', e)
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 })
  }
}
