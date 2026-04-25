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
import { insertNotifications, shouldThrottleBySenderType } from '@/lib/social/notifyFollowers'
import { getErrorMessage } from '@/utils/errorMessage'
import { env } from '@/utils/env'
import { logError } from '@/lib/logger'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const cronSecret = env.security.cronSecret
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
          { type: 'meal_reminder', link: '/dashboard/nutrition' },
          { preferenceKey: 'notifyMealReminders' },
        )
        sent++
      } catch { /* continue to next user on individual failure */ }
    }

    // ─── Missed-meal piggyback ────────────────────────────────────────
    // Re-runs the same lookup against reminders that fired 30 min ago. If
    // the user has no nutrition_meal_entries in the last 30 min, fire a
    // self push reminding them to log it. Throttled per user+type 23h so
    // it can't double-fire even if cron drifts.
    let missed = 0
    try {
      const lookback = new Date(now.getTime() - 30 * 60 * 1000)
      const lookbackHour = lookback.getUTCHours()
      const lookbackMinute = lookback.getUTCMinutes()
      const sinceIso = lookback.toISOString()

      const { data: oldReminders } = await admin
        .from('nutrition_meal_reminders')
        .select('user_id, label')
        .eq('hour', lookbackHour)
        .eq('minute', lookbackMinute)
        .eq('enabled', true)

      const oldByUser = new Map<string, string>()
      for (const r of Array.isArray(oldReminders) ? oldReminders : []) {
        oldByUser.set(String((r as { user_id?: string }).user_id), String((r as { label?: string }).label || 'Refeição'))
      }

      for (const [uid, label] of oldByUser.entries()) {
        const { count } = await admin
          .from('nutrition_meal_entries')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', uid)
          .gte('created_at', sinceIso)
        if (Number(count || 0) > 0) continue

        const throttled = await shouldThrottleBySenderType(uid, 'missed_meal', 23 * 60).catch(() => true)
        if (throttled) continue

        await insertNotifications([{
          user_id: uid,
          recipient_id: uid,
          sender_id: uid,
          type: 'missed_meal',
          title: '🍽️ Refeição em aberto',
          message: `Você ainda não registrou ${label}. Bora anotar?`,
          is_read: false,
          metadata: { reminder_label: label, reminder_hour: lookbackHour, reminder_minute: lookbackMinute },
        }])
        missed += 1
      }
    } catch (e) {
      logError('nutrition.reminders.missed_meal', e)
    }

    return NextResponse.json({ ok: true, sent, total: userIds.length, missed })
  } catch (e) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}
