import { NextResponse } from 'next/server'
import { isCronAuthorized } from '@/utils/cron/auth'
import { createAdminClient } from '@/utils/supabase/admin'
import { insertNotifications } from '@/lib/social/notifyFollowers'
import { getActivelyTrainingUsers } from '@/utils/cron/activeSessionFilter'
import { logError } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/**
 * Daily cron — fires at 10:00 UTC (07:00 BRT). Sends a "good morning,
 * here's your day" nudge to users who opted in (default OFF — too noisy
 * for everyone). Targets users who trained at least once in the last 30
 * days, to avoid waking up dormant accounts.
 * Users with an active workout session are skipped — they're already training.
 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  try {
    const admin = createAdminClient()
    const sinceIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    const [workoutRows, activeUsers] = await Promise.all([
      admin
        .from('workouts')
        .select('user_id')
        .eq('is_template', false)
        .gte('date', sinceIso)
        .limit(20000),
      getActivelyTrainingUsers(admin),
    ])

    const userIds = Array.from(new Set(
      (Array.isArray(workoutRows.data) ? workoutRows.data : [])
        .map((r) => String((r as { user_id?: string })?.user_id || '').trim())
        .filter(Boolean),
    )).filter((uid) => !activeUsers.has(uid))

    if (!userIds.length) return NextResponse.json({ ok: true, sent: 0 })

    await insertNotifications(
      userIds.map((uid) => ({
        user_id: uid,
        recipient_id: uid,
        sender_id: uid,
        type: 'morning_briefing',
        title: 'Bom dia 🌅',
        message: 'Hoje é um ótimo dia pra treinar. Vamos?',
        is_read: false,
        metadata: {},
      })),
    )
    return NextResponse.json({ ok: true, sent: userIds.length })
  } catch (e) {
    logError('cron:morning-briefing', e)
    return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 })
  }
}
