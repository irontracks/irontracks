import { NextResponse } from 'next/server'
import { isCronAuthorized } from '@/utils/cron/auth'
import { createAdminClient } from '@/utils/supabase/admin'
import { insertNotifications } from '@/lib/social/notifyFollowers'
import { logError, logInfo } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/**
 * Daily cron — fires at 06:00 UTC (03:00 BRT, low-traffic window).
 *
 * Suspends paid teacher plans whose `plan_valid_until` expired more than the
 * grace period ago. The grace period (default 3 days) gives professors a
 * cushion to pay PIX without losing access — same idea as Spotify's "your
 * subscription is paused" buffer.
 *
 * What "suspend" means here:
 *   • teachers.plan_status = 'cancelled'
 *   • The RPC teacher_can_add_student already treats 'cancelled' status as
 *     equivalent to the free tier (max 2 students). No data is deleted —
 *     paying again restores everything.
 *   • A `billing_issue` notification fires so the iOS Communication push
 *     wakes the lock screen.
 *
 * Idempotent: running it twice in the same day produces the same result.
 */

const GRACE_DAYS = 3

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  }

  try {
    const admin = createAdminClient()
    const cutoff = new Date(Date.now() - GRACE_DAYS * 24 * 60 * 60 * 1000)

    // Find teachers whose paid plan has been past-due for longer than grace.
    const { data: rows, error } = await admin
      .from('teachers')
      .select('id, user_id, plan_tier_key, plan_valid_until')
      .eq('plan_status', 'active')
      .neq('plan_tier_key', 'free')
      .not('user_id', 'is', null)
      .lt('plan_valid_until', cutoff.toISOString())
      .limit(5000)

    if (error) {
      logError('cron:teacher-plan-suspend', error)
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }

    const targets = (rows ?? []).filter((r) => Boolean(r.user_id))
    if (targets.length === 0) {
      return NextResponse.json({ ok: true, suspended: 0 })
    }

    // Batch update — single statement instead of N round-trips.
    const teacherIds = targets.map((r) => String(r.id)).filter(Boolean)
    const { error: updateErr } = await admin
      .from('teachers')
      .update({
        plan_status: 'cancelled',
        plan_valid_until: null,
      })
      .in('id', teacherIds)

    if (updateErr) {
      logError('cron:teacher-plan-suspend', updateErr)
      return NextResponse.json({ ok: false, error: updateErr.message }, { status: 500 })
    }

    // Notify each suspended teacher
    const notifs = targets.map((r) => {
      const uid = String(r.user_id || '')
      const tier = String(r.plan_tier_key || '').toUpperCase()
      return {
        user_id: uid,
        recipient_id: uid,
        sender_id: uid,
        type: 'billing_issue' as const,
        title: '🚫 Plano suspenso por falta de pagamento',
        message: `Seu plano ${tier} foi suspenso. Você está no plano FREE (até 2 alunos). Renove para reativar todos os recursos.`,
        is_read: false,
        metadata: {
          scope: 'teacher_plan_suspended',
          previous_plan_tier_key: r.plan_tier_key,
        },
      }
    })

    await insertNotifications(notifs)

    logInfo('cron:teacher-plan-suspend', `Suspended ${targets.length} teacher plan(s) past grace period`)
    return NextResponse.json({ ok: true, suspended: targets.length })
  } catch (e) {
    logError('cron:teacher-plan-suspend', e)
    return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 })
  }
}
