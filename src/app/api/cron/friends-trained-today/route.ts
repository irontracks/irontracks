import { NextResponse } from 'next/server'
import { isCronAuthorized } from '@/utils/cron/auth'
import { createAdminClient } from '@/utils/supabase/admin'
import { insertNotifications } from '@/lib/social/notifyFollowers'
import { getActivelyTrainingUsers } from '@/utils/cron/activeSessionFilter'
import { brtDateKey } from '@/utils/cron/dateBrt'
import { logError } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/**
 * Daily cron — fires at 23:00 UTC (20:00 BRT). For each user, counts how
 * many followed users trained today. If at least one, sends a social push
 * to motivate.
 *
 * Timezone correctness
 * ────────────────────
 * "Today" é o dia BRT (calendário do usuário). Antes usava
 * `toISOString().slice(0,10)` direto, o que dava UTC — mesmo bug
 * dos crons streak-at-risk e morning-briefing corrigidos antes.
 * Agora bucketamos `workouts.date` pelo dia BRT (via brtDateKey) e
 * comparamos com a BRT "hoje".
 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  try {
    const admin = createAdminClient()
    const todayKey = brtDateKey()
    // Pra cobrir borda UTC ↔ BRT, busca a partir de 32h atrás (1 dia BRT
    // completo + margem). Filtragem fina por dia BRT é feita em JS.
    const sinceIso = new Date(Date.now() - 32 * 60 * 60 * 1000).toISOString()

    // 1. Who trained today? (also fetch active sessions in parallel)
    const [todayResult, activeUsers] = await Promise.all([
      admin
        .from('workouts')
        .select('user_id, date')
        .eq('is_template', false)
        .gte('date', sinceIso)
        .limit(20000),
      getActivelyTrainingUsers(admin),
    ])
    // Merge: "trained today" includes both finished workouts and ongoing sessions
    const trainedToday = new Set(
      (Array.isArray(todayResult.data) ? todayResult.data : [])
        .filter((r) => {
          const date = (r as { date?: string })?.date
          return date ? brtDateKey(date) === todayKey : false
        })
        .map((r) => String((r as { user_id?: string })?.user_id || '').trim())
        .filter(Boolean),
    )
    activeUsers.forEach((uid) => trainedToday.add(uid))
    if (!trainedToday.size) return NextResponse.json({ ok: true, sent: 0 })

    // 2. Follow graph: follower → set of following
    const { data: follows } = await admin
      .from('social_follows')
      .select('follower_id, following_id')
      .eq('status', 'accepted')
      .limit(50000)

    const followingByFollower = new Map<string, Set<string>>()
    for (const f of Array.isArray(follows) ? follows : []) {
      const follower = String((f as { follower_id?: string })?.follower_id || '').trim()
      const following = String((f as { following_id?: string })?.following_id || '').trim()
      if (!follower || !following) continue
      if (!followingByFollower.has(follower)) followingByFollower.set(follower, new Set())
      followingByFollower.get(follower)!.add(following)
    }

    const notifs: Array<Record<string, unknown>> = []
    followingByFollower.forEach((following, follower) => {
      // Skip users who already trained today — "Bora você também?" would be wrong
      if (trainedToday.has(follower)) return
      let count = 0
      following.forEach((id) => { if (trainedToday.has(id)) count += 1 })
      if (count <= 0) return
      notifs.push({
        user_id: follower,
        recipient_id: follower,
        sender_id: follower,
        type: 'friends_trained_today',
        title: 'Seus amigos estão treinando 💪',
        message: count === 1
          ? '1 pessoa que você segue treinou hoje. Bora você também?'
          : `${count} pessoas que você segue treinaram hoje. Bora você também?`,
        is_read: false,
        metadata: { count },
      })
    })

    if (!notifs.length) return NextResponse.json({ ok: true, sent: 0 })
    await insertNotifications(notifs)
    return NextResponse.json({ ok: true, sent: notifs.length })
  } catch (e) {
    logError('cron:friends-trained-today', e)
    return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 })
  }
}
