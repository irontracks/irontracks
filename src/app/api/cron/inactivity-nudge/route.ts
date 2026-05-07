import { NextResponse } from 'next/server'
import { isCronAuthorized } from '@/utils/cron/auth'
import { createAdminClient } from '@/utils/supabase/admin'
import { insertNotifications } from '@/lib/social/notifyFollowers'
import { getActivelyTrainingUsers } from '@/utils/cron/activeSessionFilter'
import { logError } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/**
 * Daily cron — fires at 12:00 UTC (09:00 BRT). Notifies users who have not
 * trained in 3-7 days. The 7-day cap avoids spamming users who churned long
 * ago.
 * Users with an active workout session are skipped — they're already training.
 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  try {
    const admin = createAdminClient()
    const now = Date.now()
    const sevenAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const threeAgo = new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    const [workoutRows, activeUsers] = await Promise.all([
      admin
        .from('workouts')
        .select('user_id, date')
        .eq('is_template', false)
        .gte('date', sevenAgo)
        .order('date', { ascending: false })
        .limit(20000),
      getActivelyTrainingUsers(admin),
    ])

    const lastByUser = new Map<string, string>()
    for (const r of Array.isArray(workoutRows.data) ? workoutRows.data : []) {
      const uid = String((r as { user_id?: string })?.user_id || '').trim()
      const date = String((r as { date?: string })?.date || '').slice(0, 10)
      if (!uid || !date) continue
      if (!lastByUser.has(uid)) lastByUser.set(uid, date)
    }

    const nudge: Array<{ user_id: string; days: number }> = []
    lastByUser.forEach((lastDate, uid) => {
      if (activeUsers.has(uid)) return // already training right now — skip
      if (lastDate >= threeAgo) return // trained in last 3 days
      const lastMs = new Date(`${lastDate}T00:00:00.000Z`).getTime()
      const days = Math.floor((now - lastMs) / (24 * 60 * 60 * 1000))
      if (days >= 3 && days <= 7) nudge.push({ user_id: uid, days })
    })

    if (!nudge.length) return NextResponse.json({ ok: true, sent: 0 })

    await insertNotifications(
      nudge.map((row) => ({
        user_id: row.user_id,
        recipient_id: row.user_id,
        sender_id: row.user_id,
        type: 'inactivity',
        title: 'Faz tempo que não te vejo treinar 💪',
        message: `Já são ${row.days} dias sem treino. Bora retomar hoje?`,
        is_read: false,
        metadata: { days_away: row.days },
      })),
    )
    return NextResponse.json({ ok: true, sent: nudge.length })
  } catch (e) {
    logError('cron:inactivity-nudge', e)
    return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 })
  }
}
