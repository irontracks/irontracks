import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { respondDbError } from '@/utils/api/dbError'
import { parseJsonBody } from '@/utils/zod'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { logError } from '@/lib/logger'
import { planDays } from '@/lib/nutrition/dietPlanShape'
import { aplicarHorarios, MAX_REFEICOES_COM_HORARIO } from '@/lib/nutrition/mealTimes'

export const dynamic = 'force-dynamic'

/* ──────────────────────────────────────────────────────────
 * POST /api/nutrition/diet-plan/times
 *
 * O horário das refeições do plano — o que faz o lembrete existir
 * (`cron/meal-reminders` lê daqui).
 *
 * A unidade é o NOME da refeição, não a refeição de um dia: o corpo é
 * `{ times: { "Café da manhã": "07:00", "Almoço": "12:00" } }` e o horário vale nos
 * sete dias. Um plano de semana tem ~42 refeições, e um editor com 42 campos não
 * seria preenchido por ninguém.
 *
 * Vai DENTRO do JSON (`days[].meals[].time`), campo que o shape já declarava e as
 * telas já desenhavam — sem migration, e sem uma segunda tabela de horários que
 * divergiria do cardápio.
 *
 * Só mexe em plano PRÓPRIO (`created_by = user_id`), a mesma fronteira da nota e do
 * swap: escrever horário no plano prescrito seria editar a prescrição de outra
 * pessoa.
 * ────────────────────────────────────────────────────────── */

const BodySchema = z
  .object({
    times: z
      .record(z.string().trim().min(1).max(60), z.string().trim().max(5))
      .refine((r) => Object.keys(r).length <= MAX_REFEICOES_COM_HORARIO, {
        message: 'too_many_meals',
      }),
  })
  .strict()

const SELECT = 'id, plan_name, plan_kind, meals, days, notes, created_at, updated_at'

export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response
    const userId = String(auth.user.id || '').trim()

    const ip = getRequestIp(req)
    const rl = await checkRateLimitAsync(`nutrition:diet-plan:times:${userId}:${ip}`, 30, 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

    const parsed = await parseJsonBody(req, BodySchema)
    if (parsed.response || !parsed.data) {
      return parsed.response ?? NextResponse.json({ ok: false, error: 'Invalid input' }, { status: 400 })
    }

    const { data: row, error: readError } = await auth.supabase
      .from('student_diet_plans')
      .select(SELECT)
      .eq('user_id', userId)
      .eq('created_by', userId)
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (readError) return respondDbError('nutrition:diet-plan:times:read', readError)
    if (!row) return NextResponse.json({ ok: false, error: 'plan_not_found' }, { status: 404 })

    const days = planDays(row)
    if (!days.length) return NextResponse.json({ ok: false, error: 'plan_not_found' }, { status: 404 })

    const nextDays = aplicarHorarios(days, parsed.data.times)

    // Grava no MESMO formato em que o plano já estava — um plano de dia não vira
    // semana porque alguém definiu um horário.
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
    if (updateError) return respondDbError('nutrition:diet-plan:times:update', updateError)

    return NextResponse.json({ ok: true, plan: updated })
  } catch (e: unknown) {
    logError('nutrition:diet-plan:times:post', e)
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 })
  }
}
