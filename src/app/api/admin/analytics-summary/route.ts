/**
 * GET /api/admin/analytics-summary
 *
 * Retorna KPIs de engajamento do app pra a tab Analytics. Tudo
 * agregado server-side pra UI desenhar gráficos sem precisar
 * baixar dados crus.
 *
 * KPIs cobertos:
 *   - DAU / WAU / MAU (usuários ativos únicos)
 *   - Stickiness (DAU / MAU)
 *   - Treinos hoje / 7d / 30d
 *   - Novos cadastros (7d / 30d)
 *   - Pushes enviadas (24h / 7d)
 *   - Top tipos de push (qual mais saiu)
 *
 * Fonte: tabelas existentes (user_activity_events, workouts, profiles,
 * notifications). Sem schema novo.
 */
import { NextResponse } from 'next/server'
import { requireRoleOrBearer } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'
import { getErrorMessage } from '@/utils/errorMessage'

export const dynamic = 'force-dynamic'

interface AnalyticsSummary {
  // Active users
  dau: number
  wau: number
  mau: number
  stickiness: number // DAU/MAU em %

  // Workouts feitos
  workoutsToday: number
  workouts7d: number
  workouts30d: number

  // Aquisição
  newSignups7d: number
  newSignups30d: number

  // Pushes
  pushes24h: number
  pushes7d: number
  topPushTypes: Array<{ type: string; count: number }>

  // Totais
  totalUsers: number
  totalActiveUsers30d: number
}

export async function GET(req: Request) {
  try {
    const auth = await requireRoleOrBearer(req, ['admin'])
    if (!auth.ok) return auth.response

    const admin = createAdminClient()
    const now = Date.now()
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString()
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString()
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString()

    // ── DAU/WAU/MAU via user_activity_events ─────────────────────────
    // Pega user_ids distintos em cada janela. Limitamos a 5000 rows
    // por janela porque é o suficiente pra contar distintos em uma
    // base com algumas dezenas de usuários ativos.
    const fetchDistinctUserIds = async (sinceIso: string): Promise<Set<string>> => {
      const { data } = await admin
        .from('user_activity_events')
        .select('user_id')
        .gte('created_at', sinceIso)
        .limit(5000)
      const ids = new Set<string>()
      for (const r of data || []) {
        const uid = (r as { user_id?: string })?.user_id
        if (typeof uid === 'string' && uid) ids.add(uid)
      }
      return ids
    }

    const [dauSet, wauSet, mauSet] = await Promise.all([
      fetchDistinctUserIds(oneDayAgo),
      fetchDistinctUserIds(sevenDaysAgo),
      fetchDistinctUserIds(thirtyDaysAgo),
    ])

    // ── Workouts (filtramos templates pra contar só "feitos") ────────
    const fetchWorkoutCount = async (sinceIso: string): Promise<number> => {
      const { count } = await admin
        .from('workouts')
        .select('id', { count: 'exact', head: true })
        .eq('is_template', false)
        .gte('date', sinceIso)
      return count ?? 0
    }

    const [workoutsToday, workouts7d, workouts30d] = await Promise.all([
      fetchWorkoutCount(oneDayAgo),
      fetchWorkoutCount(sevenDaysAgo),
      fetchWorkoutCount(thirtyDaysAgo),
    ])

    // ── Novos cadastros (profiles) ───────────────────────────────────
    const fetchSignupCount = async (sinceIso: string): Promise<number> => {
      const { count } = await admin
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', sinceIso)
      return count ?? 0
    }

    const [newSignups7d, newSignups30d] = await Promise.all([
      fetchSignupCount(sevenDaysAgo),
      fetchSignupCount(thirtyDaysAgo),
    ])

    // ── Pushes (notifications criadas) ────────────────────────────────
    const fetchPushCount = async (sinceIso: string): Promise<number> => {
      const { count } = await admin
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', sinceIso)
      return count ?? 0
    }

    const [pushes24h, pushes7d] = await Promise.all([
      fetchPushCount(oneDayAgo),
      fetchPushCount(sevenDaysAgo),
    ])

    // Top tipos de push em 7d. Pega até 2000 rows recentes e agrupa em JS
    // (mais simples que group-by SQL via PostgREST).
    const { data: pushTypes } = await admin
      .from('notifications')
      .select('type')
      .gte('created_at', sevenDaysAgo)
      .limit(2000)
    const typeCounter = new Map<string, number>()
    for (const r of pushTypes || []) {
      const t = String((r as { type?: string })?.type || 'unknown')
      typeCounter.set(t, (typeCounter.get(t) ?? 0) + 1)
    }
    const topPushTypes = Array.from(typeCounter.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    // Total geral de usuários
    const { count: totalUsersRaw } = await admin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
    const totalUsers = totalUsersRaw ?? 0

    const summary: AnalyticsSummary = {
      dau: dauSet.size,
      wau: wauSet.size,
      mau: mauSet.size,
      stickiness: mauSet.size > 0 ? Math.round((dauSet.size / mauSet.size) * 1000) / 10 : 0,
      workoutsToday,
      workouts7d,
      workouts30d,
      newSignups7d,
      newSignups30d,
      pushes24h,
      pushes7d,
      topPushTypes,
      totalUsers,
      totalActiveUsers30d: mauSet.size,
    }

    return NextResponse.json({ ok: true, summary })
  } catch (e) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}
