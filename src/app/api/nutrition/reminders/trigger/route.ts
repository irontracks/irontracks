/**
 * POST /api/nutrition/reminders/trigger
 *
 * Called every minute by Supabase pg_cron or external cron service.
 * Finds all enabled reminders where hour+minute matches current UTC time,
 * then sends a push notification to matching users.
 *
 * Secured by a shared secret in CRON_SECRET env var.
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { sendPushToAllPlatforms } from '@/lib/push/sender'
import { getErrorMessage } from '@/utils/errorMessage'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET
    if (cronSecret) {
      const auth = req.headers.get('authorization')
      if (auth !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
      }
    }

    const now = new Date()
    const currentHour = now.getUTCHours()
    const currentMinute = now.getUTCMinutes()

    const admin = createAdminClient()

    // Find users with reminders matching this exact hour+minute
    const { data: reminders, error } = await admin
      .from('nutrition_meal_reminders')
      .select('user_id, label')
      .eq('hour', currentHour)
      .eq('minute', currentMinute)
      .eq('enabled', true)

    if (error) throw new Error(error.message)
    if (!reminders || reminders.length === 0) {
      return NextResponse.json({ ok: true, sent: 0 })
    }

    // Group by user_id (a user might have multiple reminders at same time)
    const byUser = new Map<string, string>()
    for (const r of reminders) {
      byUser.set(String(r.user_id), String(r.label))
    }

    const userIds = [...byUser.keys()]
    let sent = 0

    for (const userId of userIds) {
      const label = byUser.get(userId) || 'Refeição'
      try {
        await sendPushToAllPlatforms(
          [userId],
          `🍽️ ${label}`,
          'Hora de registrar sua refeição no IronTracks!',
          { type: 'meal_reminder', path: '/dashboard/nutrition' }
        )
        sent++
      } catch { /* continue to next user on individual failure */ }
    }

    return NextResponse.json({ ok: true, sent, total: userIds.length })
  } catch (e) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}
