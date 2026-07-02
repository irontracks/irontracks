import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { parseJsonBody } from '@/utils/zod'
import { trackMeal } from '@/lib/nutrition/engine'
import { sanitizeFoodName } from '@/lib/nutrition/security'
import { resolveDateKey } from '@/lib/nutrition/mutations'

export const dynamic = 'force-dynamic'

/**
 * Persiste uma refeição com macros JÁ CALCULADOS (pelo parser client-side).
 * Usada pela fila offline (`nutrition_log_local`) quando o usuário lança um
 * alimento conhecido sem internet. Espelha o miolo de `logMealAction`, mas sem
 * re-resolver o texto — os macros vêm prontos no payload.
 */

const ItemSchema = z
  .object({
    label: z.string().transform((s) => s.slice(0, 120)),
    grams: z.coerce.number().nonnegative(),
    calories: z.coerce.number().nonnegative(),
    protein: z.coerce.number().nonnegative(),
    carbs: z.coerce.number().nonnegative(),
    fat: z.coerce.number().nonnegative(),
  })
  .passthrough()

const BodySchema = z
  .object({
    foodName: z.string().min(1).transform((s) => s.slice(0, 120)),
    calories: z.coerce.number().nonnegative(),
    protein: z.coerce.number().nonnegative(),
    carbs: z.coerce.number().nonnegative(),
    fat: z.coerce.number().nonnegative(),
    items: z.array(ItemSchema).nullable().optional(),
    dateKey: z.string().optional(),
    // uuid otimista da fila offline → idempotência (reenvio não duplica a refeição).
    clientId: z.string().max(64).optional(),
  })
  .strip()

export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response
    const userId = String(auth.user.id || '').trim()

    const ip = getRequestIp(req)
    const rl = await checkRateLimitAsync(`nutrition:log-entry:${userId}:${ip}`, 30, 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

    const parsed = await parseJsonBody(req, BodySchema)
    if (parsed.response) return parsed.response
    const body = parsed.data!

    const meal = {
      foodName: sanitizeFoodName(body.foodName).slice(0, 120) || 'Refeição',
      calories: Math.max(0, Math.min(6000, body.calories)),
      protein: Math.max(0, Math.min(400, body.protein)),
      carbs: Math.max(0, Math.min(800, body.carbs)),
      fat: Math.max(0, Math.min(300, body.fat)),
    }

    const items = Array.isArray(body.items) && body.items.length > 0
      ? body.items.map((it) => ({
          label: String(it.label ?? '').slice(0, 120),
          grams: it.grams,
          calories: it.calories,
          protein: it.protein,
          carbs: it.carbs,
          fat: it.fat,
        }))
      : null

    const row = await trackMeal(userId, meal, resolveDateKey(body.dateKey), items, body.clientId)
    return NextResponse.json({ ok: true, row: row || null })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: message || 'nutrition_log_entry_failed' }, { status: 500 })
  }
}
