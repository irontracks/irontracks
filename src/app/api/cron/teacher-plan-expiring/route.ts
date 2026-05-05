import { NextResponse } from 'next/server'
import { isCronAuthorized } from '@/utils/cron/auth'
import { createAdminClient } from '@/utils/supabase/admin'
import { insertNotifications } from '@/lib/social/notifyFollowers'
import { logError } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/**
 * Daily cron — fires at 13:00 UTC (10:00 BRT).
 *
 * Notifies teachers whose paid plan expires in the next 24-72h. Two windows:
 *   • 3 days out — gentle heads-up ("renove até DD/MM/AAAA")
 *   • 1 day out — urgent ("seu plano vence amanhã")
 *
 * Read-only against the `teachers` table — does not change plan status. The
 * separate `/api/cron/teacher-plan-suspend` cron handles the actual suspension
 * after a 3-day grace period beyond expiry.
 *
 * The notification type is `billing_issue` (already in WAKE_SCREEN_TYPES of
 * the iOS NSE whitelist), so the Communication Notification upgrade kicks in
 * and it wakes the lock screen with sound, like WhatsApp.
 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  }

  try {
    const admin = createAdminClient()
    const now = new Date()

    // ── Window 1: 3 days out ─────────────────────────────────────────────
    const threeDaysStart = new Date(now.getTime() + 64 * 60 * 60 * 1000) // ~64h from now
    const threeDaysEnd   = new Date(now.getTime() + 72 * 60 * 60 * 1000) // 72h
    // ── Window 2: 1 day out ──────────────────────────────────────────────
    const oneDayStart    = new Date(now.getTime() + 16 * 60 * 60 * 1000) // 16h
    const oneDayEnd      = new Date(now.getTime() + 24 * 60 * 60 * 1000) // 24h

    const [{ data: threeDayRows }, { data: oneDayRows }] = await Promise.all([
      admin
        .from('teachers')
        .select('user_id, plan_tier_key, plan_valid_until')
        .eq('plan_status', 'active')
        .neq('plan_tier_key', 'free')
        .not('user_id', 'is', null)
        .gte('plan_valid_until', threeDaysStart.toISOString())
        .lt('plan_valid_until', threeDaysEnd.toISOString())
        .limit(5000),
      admin
        .from('teachers')
        .select('user_id, plan_tier_key, plan_valid_until')
        .eq('plan_status', 'active')
        .neq('plan_tier_key', 'free')
        .not('user_id', 'is', null)
        .gte('plan_valid_until', oneDayStart.toISOString())
        .lt('plan_valid_until', oneDayEnd.toISOString())
        .limit(5000),
    ])

    const fmtDate = (iso: string | null | undefined) => {
      if (!iso) return ''
      try {
        return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
      } catch { return '' }
    }

    type Row = { user_id: string | null; plan_tier_key: string | null; plan_valid_until: string | null }

    const buildNotifs = (rows: Row[] | null, tone: '3d' | '1d') => {
      const safeRows = Array.isArray(rows) ? rows : []
      return safeRows
        .map((r) => String(r.user_id || '').trim())
        .filter(Boolean)
        .map((uid, idx) => {
          const row = safeRows[idx] as Row
          const dateStr = fmtDate(row.plan_valid_until)
          const tier = String(row.plan_tier_key || '').toUpperCase()
          const title = tone === '1d'
            ? '⚠️ Seu plano vence amanhã'
            : '📅 Seu plano vence em 3 dias'
          const message = tone === '1d'
            ? `O plano ${tier} expira ${dateStr ? `em ${dateStr}` : 'em breve'}. Renove para manter o acesso aos seus alunos.`
            : `O plano ${tier} vence ${dateStr ? `em ${dateStr}` : 'em 3 dias'}. Renove para evitar a suspensão.`
          return {
            user_id: uid,
            recipient_id: uid,
            sender_id: uid,
            type: 'billing_issue',
            title,
            message,
            is_read: false,
            metadata: {
              scope: 'teacher_plan',
              window: tone,
              plan_tier_key: row.plan_tier_key,
              plan_valid_until: row.plan_valid_until,
            },
          }
        })
    }

    const notifs = [
      ...buildNotifs(threeDayRows as Row[] | null, '3d'),
      ...buildNotifs(oneDayRows as Row[] | null, '1d'),
    ]

    if (notifs.length === 0) return NextResponse.json({ ok: true, sent: 0 })

    await insertNotifications(notifs)
    return NextResponse.json({
      ok: true,
      sent: notifs.length,
      threeDay: (threeDayRows ?? []).length,
      oneDay: (oneDayRows ?? []).length,
    })
  } catch (e) {
    logError('cron:teacher-plan-expiring', e)
    return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 })
  }
}
