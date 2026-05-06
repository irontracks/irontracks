import { NextResponse } from 'next/server'
import { isCronAuthorized } from '@/utils/cron/auth'
import { createAdminClient } from '@/utils/supabase/admin'
import { insertNotifications } from '@/lib/social/notifyFollowers'
import { logError } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/**
 * Daily cron — fires at 23:00 UTC (20:00 BRT). For each user, counts how
 * many followed users trained today. If at least one, sends a social push
 * to motivate.
 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  try {
    const admin = createAdminClient()
    const todayKey = new Date().toISOString().slice(0, 10)

    // 1. Who trained today?
    const { data: todayRows } = await admin
      .from('workouts')
      .select('user_id')
      .eq('is_template', false)
      .gte('date', todayKey)
      .limit(20000)
    const trainedToday = new Set(
      (Array.isArray(todayRows) ? todayRows : [])
        .map((r) => String((r as { user_id?: string })?.user_id || '').trim())
        .filter(Boolean),
    )
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
