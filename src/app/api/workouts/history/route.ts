import { NextResponse } from 'next/server'
import { respondInternalError } from '@/utils/api/internalError'
import { z } from 'zod'
import { parseSearchParams } from '@/utils/zod'
import { createClient } from '@/utils/supabase/server'
import { getVipPlanLimits } from '@/utils/vip/limits'
import { cacheGet, cacheSet } from '@/utils/cache'
import { respondDbError } from '@/utils/api/dbError'
import { buildSlimHistoryRow } from '@/utils/history/slimHistoryRow'

export const dynamic = 'force-dynamic'

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(20),
})

export async function GET(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const { data: q, response } = parseSearchParams(req, QuerySchema)
    if (response) return response
    if (!q) return NextResponse.json({ ok: false, error: 'invalid_query' }, { status: 400 })

    // Parallel: fetch VIP limits while building the query
    const vipPromise = getVipPlanLimits(supabase, user.id)

    // Start building the base query immediately
    let baseQuery = supabase
      .from('workouts')
      .select('id, name, user_id, date, created_at, completed_at, notes, is_template')
      .eq('user_id', user.id)
      .eq('is_template', false)
      .order('date', { ascending: false })
      .limit(q.limit)

    // Wait for VIP limits (runs in parallel with query build)
    const { limits, tier } = await vipPromise

    const historyDays = limits.history_days
    let cutoff: string | null = null
    if (typeof historyDays === 'number' && Number.isFinite(historyDays) && historyDays > 0) {
      cutoff = new Date(Date.now() - historyDays * 24 * 60 * 60 * 1000).toISOString()
      baseQuery = baseQuery.gte('date', cutoff)
    }

    // Also fetch standalone cardio sessions (no workout_id) in parallel
    let cardioQuery = supabase
      .from('cardio_tracks')
      .select('id, activity_type, distance_meters, duration_seconds, avg_pace_min_km, calories_estimated, avg_heart_rate, max_heart_rate, source, notes, perceived_effort, started_at, finished_at, created_at')
      .eq('user_id', user.id)
      .is('workout_id', null)
      .order('created_at', { ascending: false })
      .limit(q.limit)

    if (cutoff) {
      cardioQuery = cardioQuery.gte('created_at', cutoff)
    }

    // v2 = linhas magras (sem `notes`) — não pode servir payload v1 cacheado.
    const cacheKey = `workouts:history:v2:${user.id}:${q.limit}:${historyDays ?? 'all'}:${tier}`
    const cached = await cacheGet<Record<string, unknown>>(cacheKey, (v) => (v && typeof v === 'object' ? (v as Record<string, unknown>) : null))
    if (cached) return NextResponse.json(cached)

    const [workoutsResult, cardioResult] = await Promise.all([baseQuery, cardioQuery])

    if (workoutsResult.error) return respondDbError('workouts:history', workoutsResult.error)

    // Shape cardio rows to match the WorkoutSummary expected by the client
    type CardioRow = {
      id: string
      activity_type: string
      distance_meters: number | null
      duration_seconds: number | null
      avg_pace_min_km: number | null
      calories_estimated: number | null
      avg_heart_rate: number | null
      max_heart_rate: number | null
      source: string | null
      notes: string | null
      perceived_effort: number | null
      started_at: string | null
      finished_at: string | null
      created_at: string
    }
    const cardioRows = (cardioResult.data ?? []).map((c: CardioRow) => ({
      id: c.id,
      kind: 'cardio' as const,
      name: 'Cardio',
      date: c.started_at ?? c.created_at,
      completed_at: c.finished_at,
      created_at: c.created_at,
      is_template: false,
      activity_type: c.activity_type ?? 'running',
      distance_meters: c.distance_meters,
      duration_seconds: c.duration_seconds,
      avg_pace_min_km: c.avg_pace_min_km,
      calories_estimated: c.calories_estimated,
      // FC e origem: ~40 B por linha de cardio, decisão consciente registrada na
      // allowlist do guard de payload. Sem eles, o dado do Watch é gravado e
      // ninguém vê — e o modal teria de fazer uma segunda requisição só para ler
      // dois números que já vieram na mesma consulta.
      avg_heart_rate: c.avg_heart_rate,
      max_heart_rate: c.max_heart_rate,
      source: c.source,
      cardio_notes: c.notes,
      perceived_effort: c.perceived_effort,
    }))

    // Merge and sort by date descending
    type AnyRow = Record<string, unknown>
    // Resumo no servidor: a lista só precisa de título/tempo/volume/nº de
    // exercícios — o JSON da sessão (workouts.notes, potencialmente centenas de
    // KB em 50 treinos) NÃO desce pro client. Detalhe é buscado sob demanda.
    const slimWorkoutRows = (workoutsResult.data ?? []).map((w: Record<string, unknown>) =>
      buildSlimHistoryRow(w) as unknown as Record<string, unknown>)

    const allRows: AnyRow[] = [
      ...slimWorkoutRows,
      ...cardioRows,
    ].sort((a, b) => {
      const aDate = String(a.date ?? a.created_at ?? '')
      const bDate = String(b.date ?? b.created_at ?? '')
      return bDate.localeCompare(aDate)
    })

    const payload = {
      ok: true,
      tier,
      history_days: historyDays,
      rows: allRows,
    }

    await cacheSet(cacheKey, payload, 120)

    return NextResponse.json(payload)
  } catch (e: unknown) {
    return respondInternalError('api:workouts:history', e)
  }
}
