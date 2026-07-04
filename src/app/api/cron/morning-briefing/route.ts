import { NextResponse } from 'next/server'
import { isCronAuthorized } from '@/utils/cron/auth'
import { createAdminClient } from '@/utils/supabase/admin'
import { insertNotifications } from '@/lib/social/notifyFollowers'
import { getActivelyTrainingUsers } from '@/utils/cron/activeSessionFilter'
import { brtDateKey } from '@/utils/cron/dateBrt'
import { logError } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/**
 * Daily cron — fires at 10:00 UTC (07:00 BRT). Sends a "good morning,
 * here's your day" nudge to users who trained at least once in the last
 * 30 days, to avoid waking up dormant accounts.
 *
 * Skipped:
 * - Users with an active workout session (already training right now).
 * - Users who already trained today (BRT calendar day) — sending
 *   "vamos treinar?" to someone who finished a workout 30 min ago is the
 *   exact UX bug we want to avoid.
 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  try {
    const admin = createAdminClient()
    const todayKey = brtDateKey()
    // Over-fetch by one day on each side so timestamps right on the BRT
    // boundary don't get clipped when we re-bucket by BRT calendar day.
    const sinceIso = new Date(Date.now() - 32 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const recentSinceIso = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    const [recentWorkoutRows, todayWorkoutRows, activeUsers] = await Promise.all([
      // Pool of "trained recently" candidates (last 30 BRT days).
      admin
        .from('workouts')
        .select('user_id, date')
        .eq('is_template', false)
        .gte('date', sinceIso)
        .limit(20000),
      // Narrow window covering the past ~2 UTC days, used to figure out
      // who already trained TODAY in BRT. Splitting this out keeps the
      // payload small and the "trained today" check fast.
      admin
        .from('workouts')
        .select('user_id, date')
        .eq('is_template', false)
        .gte('date', recentSinceIso)
        .limit(20000),
      getActivelyTrainingUsers(admin),
    ])

    const trainedTodayBrt = new Set<string>()
    for (const r of Array.isArray(todayWorkoutRows.data) ? todayWorkoutRows.data : []) {
      const uid = String((r as { user_id?: string })?.user_id || '').trim()
      const rawDate = (r as { date?: string })?.date
      if (!uid || !rawDate) continue
      if (brtDateKey(rawDate) === todayKey) trainedTodayBrt.add(uid)
    }

    const userIds = Array.from(new Set(
      (Array.isArray(recentWorkoutRows.data) ? recentWorkoutRows.data : [])
        .map((r) => String((r as { user_id?: string })?.user_id || '').trim())
        .filter(Boolean),
    ))
      .filter((uid) => !activeUsers.has(uid))
      .filter((uid) => !trainedTodayBrt.has(uid))

    if (!userIds.length) return NextResponse.json({ ok: true, sent: 0 })

    await insertNotifications(
      userIds.map((uid) => ({
        user_id: uid,
        recipient_id: uid,
        sender_id: uid,
        type: 'morning_briefing',
        title: 'Bom dia 🌅',
        message: 'Vai treinar hoje? Abra o app e responda — se for descansar, ajusto suas calorias do dia.',
        is_read: false,
        metadata: {},
      })),
    )
    return NextResponse.json({ ok: true, sent: userIds.length, skippedAlreadyTrainedToday: trainedTodayBrt.size })
  } catch (e) {
    logError('cron:morning-briefing', e)
    return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 })
  }
}
