/**
 * POST /api/teachers/cancel-recurring
 *
 * Cancels the teacher's active recurring subscription on MercadoPago AND
 * marks the local mirror row as cancelled. The professor's plan stays active
 * until `plan_valid_until` runs out — same as Spotify's "you'll have access
 * until the end of the period". The suspend cron handles the rest.
 *
 * Idempotent: calling it on an already-cancelled subscription is a no-op.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { mercadopagoRequest } from '@/lib/mercadopago'
import { getErrorMessage } from '@/utils/errorMessage'
import { respondDbError } from '@/utils/api/dbError'
import { logWarn } from '@/lib/logger'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const admin = createAdminClient()

    const { data: subs, error } = await admin
      .from('app_subscriptions')
      .select('id, provider_subscription_id, status')
      .eq('user_id', user.id)
      .eq('provider', 'mercadopago')
      .filter('metadata->>scope', 'eq', 'teacher_plan_recurring')
      .in('status', ['pending', 'active', 'past_due'])

    if (error) return respondDbError('teacher:cancel_recurring', error)
    if (!subs || subs.length === 0) {
      return NextResponse.json({ ok: true, cancelled: 0 })
    }

    let cancelled = 0
    for (const sub of subs) {
      const id = String(sub.provider_subscription_id || '').trim()
      if (id) {
        try {
          await mercadopagoRequest({
            method: 'PUT',
            path: `/preapproval/${encodeURIComponent(id)}`,
            body: { status: 'cancelled' },
          })
        } catch (e) {
          logWarn('teacher_cancel_recurring', `Cancel call failed for ${id}`, e)
          // Continue with local update — the webhook will reconcile if MP
          // returns a different state on its end.
        }
      }
      await admin
        .from('app_subscriptions')
        .update({
          status: 'cancelled',
          cancel_at_period_end: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', sub.id)
      cancelled++
    }

    return NextResponse.json({ ok: true, cancelled })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}
