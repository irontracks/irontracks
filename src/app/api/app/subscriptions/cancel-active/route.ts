import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { asaasRequest } from '@/lib/asaas'
import { mercadopagoRequest } from '@/lib/mercadopago'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const planId = String(body?.planId || '').trim()

    const admin = createAdminClient()

    let q = admin
      .from('app_subscriptions')
      .select('id, user_id, plan_id, status, provider, provider_subscription_id, asaas_subscription_id, metadata, created_at')
      .eq('user_id', user.id)
      .in('status', ['active', 'past_due'])
      .order('created_at', { ascending: false })
      .limit(1)
    if (planId) q = q.eq('plan_id', planId)

    const { data: sub, error } = await q.maybeSingle()
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
    if (!sub?.id) return NextResponse.json({ ok: true, cancelled: false })

    const provider = String(sub?.provider || '').trim()
    const providerSubId = String(sub?.provider_subscription_id || '').trim()
    const asaasSubId = String(sub?.asaas_subscription_id || '').trim()

    if (provider === 'mercadopago' && providerSubId) {
      try {
        await mercadopagoRequest({
          method: 'PUT',
          path: `/preapproval/${encodeURIComponent(providerSubId)}`,
          body: { status: 'cancelled' },
        })
      } catch {}
    }

    if (provider === 'asaas' && (providerSubId || asaasSubId)) {
      const target = providerSubId || asaasSubId
      try {
        await asaasRequest({
          method: 'PUT',
          path: `/subscriptions/${encodeURIComponent(target)}`,
          body: { status: 'INACTIVE' },
        })
      } catch {}
    }

    await admin
      .from('app_subscriptions')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
        metadata: {
          ...(sub?.metadata && typeof sub.metadata === 'object' ? sub.metadata : {}),
          cancellation: { at: new Date().toISOString(), by: 'user', reason: 'cancel_active_subscription' },
        },
      })
      .eq('id', sub.id)

    return NextResponse.json({ ok: true, cancelled: true, id: sub.id })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}

