import { NextResponse } from 'next/server'
import { isCronAuthorized } from '@/utils/cron/auth'
import { createAdminClient } from '@/utils/supabase/admin'
import { insertNotifications } from '@/lib/social/notifyFollowers'
import { logError } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/**
 * Daily cron — fires at 17:00 UTC (14:00 BRT). Opt-in only (default OFF in
 * settings). Sends a hydration reminder to users who explicitly turned the
 * pref on. Targets users active in the last 14 days to avoid waking up
 * dormant accounts.
 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  try {
    const admin = createAdminClient()
    const sinceIso = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    const { data: rows } = await admin
      .from('workouts')
      .select('user_id')
      .eq('is_template', false)
      .gte('date', sinceIso)
      .limit(20000)

    const userIds = Array.from(new Set(
      (Array.isArray(rows) ? rows : []).map((r) => String((r as { user_id?: string })?.user_id || '').trim()).filter(Boolean),
    ))

    if (!userIds.length) return NextResponse.json({ ok: true, sent: 0 })

    // The opt-in filter is enforced by insertNotifications via the type→pref
    // mapping (water_reminder → notifyWaterReminder, default false).
    await insertNotifications(
      userIds.map((uid) => ({
        user_id: uid,
        recipient_id: uid,
        sender_id: uid,
        type: 'water_reminder',
        title: 'Hidratação 💧',
        message: 'Hora de beber um copo de água.',
        is_read: false,
        metadata: {},
      })),
    )
    return NextResponse.json({ ok: true, candidates: userIds.length })
  } catch (e) {
    logError('cron:water-reminder', e)
    return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 })
  }
}
