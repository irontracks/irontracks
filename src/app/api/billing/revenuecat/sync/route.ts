import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'

export const dynamic = 'force-dynamic'

const getRevenueCatSubscriber = async (appUserId: string) => {
  const secret = String(process.env.REVENUECAT_SECRET_API_KEY || process.env.REVENUECAT_SECRET_KEY || '').trim()
  if (!secret) throw new Error('revenuecat_secret_missing')
  const url = `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    cache: 'no-store',
  })
  const json = await res.json().catch((): any => null)
  if (!res.ok) {
    const msg = String(json?.message || json?.error || `revenuecat_http_${res.status}`)
    throw new Error(msg)
  }
  return json
}

const isEntitlementActive = (expiresDate: string | null) => {
  if (!expiresDate) return true
  const t = new Date(expiresDate).getTime()
  if (!Number.isFinite(t)) return false
  return t > Date.now()
}

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const entitlementId = String(process.env.REVENUECAT_ENTITLEMENT_ID || 'vip').trim() || 'vip'
    const payload = await getRevenueCatSubscriber(user.id)
    const subscriber = payload?.subscriber && typeof payload.subscriber === 'object' ? payload.subscriber : null
    const entitlements = subscriber?.entitlements && typeof subscriber.entitlements === 'object' ? subscriber.entitlements : {}
    const ent = entitlements?.[entitlementId] && typeof entitlements[entitlementId] === 'object' ? entitlements[entitlementId] : null
    const productId = String(ent?.product_identifier || '').trim()
    const expiresDate = ent?.expires_date ? String(ent.expires_date) : null
    const active = !!ent && !!productId && isEntitlementActive(expiresDate)
    if (!active) return NextResponse.json({ ok: false, error: 'no_active_entitlement' }, { status: 402 })

    const admin = createAdminClient()
    const { data: plan } = await admin
      .from('app_plans')
      .select('id')
      .eq('id', productId)
      .maybeSingle()
    if (!plan?.id) return NextResponse.json({ ok: false, error: 'plan_not_found' }, { status: 400 })

    const { data: existing } = await admin
      .from('app_subscriptions')
      .select('id, status')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const meta = {
      provider: 'revenuecat',
      entitlement_id: entitlementId,
      product_identifier: productId,
      original_app_user_id: String(subscriber?.original_app_user_id || ''),
      management_url: String(subscriber?.management_url || ''),
      synced_at: new Date().toISOString(),
    }

    if (existing?.id) {
      const { error } = await admin
        .from('app_subscriptions')
        .update({
          plan_id: productId,
          status: 'active',
          current_period_end: expiresDate,
          cancel_at_period_end: false,
          metadata: meta,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
    } else {
      const { error } = await admin
        .from('app_subscriptions')
        .insert({
          user_id: user.id,
          plan_id: productId,
          status: 'active',
          current_period_start: new Date().toISOString(),
          current_period_end: expiresDate,
          cancel_at_period_end: false,
          metadata: meta,
        })
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true, planId: productId, expiresDate })
  } catch (e: any) {
    const msg = e?.message ? String(e.message) : String(e || 'error')
    return NextResponse.json({ ok: false, error: msg }, { status: 400 })
  }
}
