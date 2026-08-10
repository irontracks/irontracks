/**
 * GET /api/nutrition/correlation
 *
 * Returns the last 30 days with flags indicating:
 * - had_workout: user trained on that day
 * - had_nutrition: user logged nutrition on that day
 * - nutrition_calories: kcal logged in nutrition on that day
 *
 * O bucketing por dia vive em `lib/nutrition/correlationDays` (função pura): o
 * dia é o calendário de São Paulo, nunca o UTC. Ver o cabeçalho de lá.
 *
 * `workout_calories` NÃO existe mais na resposta: era um literal de 300 kcal por
 * sessão — a tabela `workouts` não guarda duração nem gasto — exibido no tooltip
 * como se fosse medição. Número inventado com cara de fato é pior que campo
 * ausente, e a estimativa real (`estimateSessionKcal`) exige ler `workouts.notes`,
 * que é justamente a coluna que não pode entrar em rota quente.
 */
import { NextResponse } from 'next/server'
import { requireUser } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { buildCorrelationDays, CORRELATION_WINDOW_DAYS } from '@/lib/nutrition/correlationDays'
import { brtDateKey } from '@/utils/cron/dateBrt'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response
  const ip = getRequestIp(req)
  const rl = await checkRateLimitAsync(`nutrition:correlation:${auth.user.id}:${ip}`, 30, 60_000)
  if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

  const admin = createAdminClient()
  // Um dia a mais de folga na janela: o corte é por dia BRT e a consulta por
  // instante UTC — sem a folga, o dia mais antigo da grade perderia as sessões
  // da noite.
  const windowStart = new Date(Date.now() - (CORRELATION_WINDOW_DAYS + 1) * 24 * 60 * 60 * 1000)

  // Workout days from `workouts` (the legacy `workout_sessions` table does not
  // exist — Postgrest returned 404, leaving the heatmap always at 0 workouts).
  // Completed workouts are is_template=false rows with a `date`.
  const { data: sessions } = await admin
    .from('workouts')
    .select('date')
    .eq('user_id', auth.user.id)
    .eq('is_template', false)
    .gte('date', windowStart.toISOString())
    .order('date', { ascending: true })

  // Nutrition days from daily_nutrition_logs
  const { data: nutLogs } = await admin
    .from('daily_nutrition_logs')
    .select('date, calories')
    .eq('user_id', auth.user.id)
    .gte('date', brtDateKey(windowStart))
    .lte('date', brtDateKey())

  const { days, stats } = buildCorrelationDays(
    (Array.isArray(sessions) ? sessions : []).map((s) => String((s as { date?: string }).date || '')),
    Array.isArray(nutLogs) ? nutLogs : [],
    Date.now(),
  )

  return NextResponse.json({ ok: true, days, stats })
}
