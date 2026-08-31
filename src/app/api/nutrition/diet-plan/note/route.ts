import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { respondDbError } from '@/utils/api/dbError'
import { parseJsonBody } from '@/utils/zod'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { logError } from '@/lib/logger'
import { planDays, MAX_NOTA_DA_REFEICAO, type PlanDay } from '@/lib/nutrition/dietPlanShape'

export const dynamic = 'force-dynamic'

/* ──────────────────────────────────────────────────────────
 * POST /api/nutrition/diet-plan/note
 *
 * A observação de UMA refeição do plano ("bater no liquidificador", "se não
 * tiver frango, atum"). Persiste na hora, como a troca de alimento — o usuário
 * não precisa lembrar de salvar.
 *
 * Vai DENTRO do JSON da refeição (`days[].meals[].note`), não numa coluna nova:
 * `student_diet_plans.meals/days` é JSONB, então isto não exige migration. Não
 * confundir com `student_diet_plans.notes`, que é do plano INTEIRO.
 *
 * Só mexe em plano PRÓPRIO (`created_by = user_id`) — anotar no plano prescrito
 * seria escrever na prescrição de outra pessoa. É a mesma fronteira do swap.
 * ────────────────────────────────────────────────────────── */

const BodySchema = z
  .object({
    /** Índice do dia (0 em plano de um dia só). */
    dayIndex: z.number().int().min(0).max(6).default(0),
    mealIndex: z.number().int().min(0).max(19),
    /** Vazio APAGA a nota — é como o usuário desfaz o que escreveu. */
    note: z.string().max(MAX_NOTA_DA_REFEICAO),
  })
  .strict()

const SELECT = 'id, plan_name, plan_kind, meals, days, notes, created_at, updated_at'

export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response
    const userId = String(auth.user.id || '').trim()

    const ip = getRequestIp(req)
    const rl = await checkRateLimitAsync(`nutrition:diet-plan:note:${userId}:${ip}`, 40, 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

    const parsed = await parseJsonBody(req, BodySchema)
    if (parsed.response || !parsed.data) {
      return parsed.response ?? NextResponse.json({ ok: false, error: 'Invalid input' }, { status: 400 })
    }
    const { dayIndex, mealIndex } = parsed.data
    const note = parsed.data.note.trim().slice(0, MAX_NOTA_DA_REFEICAO)

    const { data: row, error: readError } = await auth.supabase
      .from('student_diet_plans')
      .select(SELECT)
      .eq('user_id', userId)
      .eq('created_by', userId)
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (readError) return respondDbError('nutrition:diet-plan:note:read', readError)
    if (!row) return NextResponse.json({ ok: false, error: 'plan_not_found' }, { status: 404 })

    const days = planDays(row)
    const meal = days[dayIndex]?.meals?.[mealIndex]
    if (!meal) return NextResponse.json({ ok: false, error: 'meal_not_found' }, { status: 404 })

    const nextDays: PlanDay[] = days.map((d, di) =>
      di !== dayIndex
        ? d
        : {
            ...d,
            meals: d.meals.map((m, mi) => {
              if (mi !== mealIndex) return m
              // Nota vazia REMOVE a chave em vez de gravar "": o shape trata
              // ausente e vazio igual, e a chave vazia só engordaria o payload.
              const { note: _antiga, ...semNota } = m
              return note ? { ...semNota, note } : semNota
            }),
          },
    )

    // Grava no MESMO formato em que o plano já estava — um plano de dia não
    // vira semana porque alguém escreveu uma observação.
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
    if (updateError) return respondDbError('nutrition:diet-plan:note:update', updateError)

    return NextResponse.json({ ok: true, plan: updated })
  } catch (e: unknown) {
    logError('nutrition:diet-plan:note:post', e)
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 })
  }
}
