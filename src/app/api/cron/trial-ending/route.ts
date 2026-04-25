import { NextResponse } from 'next/server'
import { isCronAuthorized } from '@/utils/cron/auth'
import { createAdminClient } from '@/utils/supabase/admin'
import { insertNotifications } from '@/lib/social/notifyFollowers'
import { logError } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/**
 * Daily cron — fires at 13:00 UTC (10:00 BRT). Notifies users whose VIP
 * subscription is set to NOT auto-renew (cancel_at_period_end = true) and
 * expires within the next 24-48h. Read-only against billing tables — does
 * not touch payment flows.
 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  try {
    const admin = createAdminClient()
    const now = new Date()
    const start = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString()
    const end = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString()

    const { data: rows } = await admin
      .from('app_subscriptions')
      .select('user_id, current_period_end, plan_id')
      .eq('status', 'active')
      .eq('cancel_at_period_end', true)
      .gte('current_period_end', start)
      .lt('current_period_end', end)
      .limit(5000)

    const userIds = Array.from(new Set(
      (Array.isArray(rows) ? rows : []).map((r) => String((r as { user_id?: string })?.user_id || '').trim()).filter(Boolean),
    ))
    if (!userIds.length) return NextResponse.json({ ok: true, sent: 0 })

    await insertNotifications(
      userIds.map((uid) => ({
        user_id: uid,
        recipient_id: uid,
        sender_id: uid,
        type: 'trial_ending',
        title: 'Sua assinatura VIP termina em breve',
        message: 'Em 24h sua assinatura expira. Renove a tempo pra não perder o acesso.',
        is_read: false,
        metadata: {},
      })),
    )
    return NextResponse.json({ ok: true, sent: userIds.length })
  } catch (e) {
    logError('cron:trial-ending', e)
    return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 })
  }
}
