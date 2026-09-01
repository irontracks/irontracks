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
import { alternativaDeProteina } from '@/lib/nutrition/alternativaDeProteina'
import { planDays } from '@/lib/nutrition/dietPlanShape'

export const dynamic = 'force-dynamic'

/* ──────────────────────────────────────────────────────────
 * POST /api/nutrition/diet-plan/alternatives
 *
 * A segunda opção de proteína que o card OFERECE embaixo de cada carne — "peito de
 * frango 180 g" com "opção: 200 g de carne moída" logo abaixo, para o usuário
 * escolher ANTES de lançar em vez de lançar e editar.
 *
 * Irmã da rota de swap, com uma diferença que é o ponto dela: **não grava nada**. A
 * troca do ↻ reescreve o plano; esta aqui só responde "o que mais caberia aqui", e a
 * escolha do usuário vale para o lançamento. Por isso é a mesma leitura de
 * candidatos e o MESMO motor — duas fontes de sugestão diriam coisas diferentes na
 * mesma tela.
 *
 * Sem IA, como a troca: sai do repertório do usuário + base curada, é instantânea e
 * não custa chamada paga.
 * ────────────────────────────────────────────────────────── */

const BodySchema = z
  .object({
    dayIndex: z.number().int().min(0).max(6).default(0),
  })
  .strip()

const SELECT = 'id, plan_kind, meals, days'

export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response
    const userId = String(auth.user.id || '').trim()

    const ip = getRequestIp(req)
    const rl = await checkRateLimitAsync(`nutrition:diet-plan:alternatives:${userId}:${ip}`, 60, 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

    const parsed = await parseJsonBody(req, BodySchema)
    if (parsed.response || !parsed.data) {
      return parsed.response ?? NextResponse.json({ ok: false, error: 'Invalid input' }, { status: 400 })
    }
    const { dayIndex } = parsed.data

    const { data: row, error: readError } = await auth.supabase
      .from('student_diet_plans')
      .select(SELECT)
      .eq('user_id', userId)
      .eq('created_by', userId)
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (readError) return respondDbError('nutrition:diet-plan:alternatives:read', readError)
    if (!row) return NextResponse.json({ ok: false, error: 'plan_not_found' }, { status: 404 })

    const day = planDays(row)[dayIndex]
    if (!day) return NextResponse.json({ ok: true, alternatives: [] })

    const [candidates, foodMealMap] = await Promise.all([
      buildSwapCandidates(auth.supabase, userId),
      buildUserFoodMealMap(auth.supabase, userId),
    ])

    const alternatives = day.meals.flatMap((meal, mealIndex) => {
      const mealGroup = mealGroupOf(meal.name)
      return meal.items.flatMap((item, itemIndex) => {
        const alt = alternativaDeProteina(item, candidates, {
          // O resto do prato entra no exclude pelo mesmo motivo da troca: oferecer
          // como "opção" algo que já está na refeição serviria o mesmo duas vezes.
          exclude: meal.items.map((i) => i.food),
          mealGroup,
          foodMealMap,
        })
        return alt ? [{ mealIndex, itemIndex, alternative: alt }] : []
      })
    })

    return NextResponse.json({ ok: true, alternatives })
  } catch (e: unknown) {
    logError('nutrition:diet-plan:alternatives', e)
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 })
  }
}
