/**
 * GET /api/teachers/active-subscription
 *
 * Returns the teacher's most-recent recurring MercadoPago subscription (if any).
 * The Upgrade modal reads this to:
 *   • Show "Assinatura ativa: PRO — próxima cobrança em DD/MM" instead of
 *     re-prompting the user to subscribe to a plan they already have
 *   • Surface the "Cancelar assinatura" button when status='active'
 *   • Resume the MP checkout `init_point` if status='pending' (user closed
 *     the WebView before completing payment)
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { getErrorMessage } from '@/utils/errorMessage'
import { respondDbError } from '@/utils/api/dbError'

export const dynamic = 'force-dynamic'

interface MetaShape {
  scope?: string
  tier_key?: string
  plan_name?: string
  init_point?: string
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const admin = createAdminClient()

    const { data, error } = await admin
      .from('app_subscriptions')
      .select(`
        id, status, provider, provider_subscription_id,
        current_period_start, current_period_end, cancel_at_period_end,
        metadata, created_at, updated_at
      `)
      .eq('user_id', user.id)
      .eq('provider', 'mercadopago')
      .filter('metadata->>scope', 'eq', 'teacher_plan_recurring')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) return respondDbError('teacher:active_subscription', error)
    if (!data) return NextResponse.json({ ok: true, subscription: null })

    const meta = (data.metadata ?? {}) as MetaShape
    return NextResponse.json({
      ok: true,
      subscription: {
        id: String(data.id),
        status: String(data.status || 'unknown'),
        provider: String(data.provider || ''),
        provider_subscription_id: data.provider_subscription_id ? String(data.provider_subscription_id) : null,
        current_period_start: data.current_period_start ? String(data.current_period_start) : null,
        current_period_end: data.current_period_end ? String(data.current_period_end) : null,
        cancel_at_period_end: !!data.cancel_at_period_end,
        tier_key: meta.tier_key ?? null,
        plan_name: meta.plan_name ?? null,
        init_point: meta.init_point ?? null,
        created_at: data.created_at ? String(data.created_at) : null,
      },
    })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}
