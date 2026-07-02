import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { getErrorMessage } from '@/utils/errorMessage'
import { logError } from '@/lib/logger'
import { respondDbError } from '@/utils/api/dbError'
import { cacheDelete } from '@/utils/cache'
import { env } from '@/utils/env'

/**
 * Maps Apple/RevenueCat product identifiers to app_plans.id values.
 * e.g. "vip_pro_monthly" → "vip_pro", "vip_pro_year" → "vip_pro_annual"
 */
export function resolveDbPlanId(productId: string): string {
  const s = String(productId || '').trim().toLowerCase()
  if (!s) return s
  const withAnnual = s
    .replace(/\d+_yearly$/, '_annual')
    .replace(/\d+_year$/, '_annual')
    .replace(/_yearly$/, '_annual')
    .replace(/_year$/, '_annual')
  if (withAnnual !== s) return withAnnual
  return s
    .replace(/\d+_monthly$/, '')
    .replace(/\d+_month$/, '')
    .replace(/_monthly$/, '')
    .replace(/_month$/, '')
    .replace(/_mensal$/, '')
}

export const dynamic = 'force-dynamic'

const getRevenueCatSubscriber = async (appUserId: string) => {
  const secret = env.revenuecat.secretKey.trim()
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
  const json = await res.json().catch((): null => null)
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

    const entitlementId = env.revenuecat.entitlementId.trim() || 'vip'
    const payload = await getRevenueCatSubscriber(user.id)
    const subscriber = payload?.subscriber && typeof payload.subscriber === 'object' ? payload.subscriber : null
    const entitlements = subscriber?.entitlements && typeof subscriber.entitlements === 'object' ? subscriber.entitlements : {}
    const ent = entitlements?.[entitlementId] && typeof entitlements[entitlementId] === 'object' ? entitlements[entitlementId] : null
    const productId = String(ent?.product_identifier || '').trim()
    const expiresDate = ent?.expires_date ? String(ent.expires_date) : null
    const active = !!ent && !!productId && isEntitlementActive(expiresDate)
    if (!active) return NextResponse.json({ ok: false, error: 'no_active_entitlement' }, { status: 402 })

    const admin = createAdminClient()
    // Try exact Apple product ID first, then normalized DB plan ID
    const dbPlanId = resolveDbPlanId(productId)
    const candidates = [...new Set([productId, dbPlanId].filter(Boolean))]
    let resolvedPlanId: string | null = null
    for (const candidate of candidates) {
      const { data: plan } = await admin.from('app_plans').select('id').eq('id', candidate).maybeSingle()
      if (plan?.id) { resolvedPlanId = plan.id; break }
    }
    if (!resolvedPlanId) return NextResponse.json({ ok: false, error: 'plan_not_found' }, { status: 400 })

    // Find any active Apple/RevenueCat subscription for this user.
    // The partial unique index enforces one active row per user, so we must
    // query all Apple-IAP providers together — 'apple' (written by the webhook)
    // and 'revenuecat' (legacy rows).  Filtering only 'revenuecat' misses rows
    // tagged 'apple', causing a duplicate-key error on the INSERT below.
    const { data: existing } = await admin
      .from('app_subscriptions')
      .select('id, status')
      .eq('user_id', user.id)
      .in('provider', ['apple', 'revenuecat'])
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
          plan_id: resolvedPlanId,
          status: 'active',
          current_period_end: expiresDate,
          cancel_at_period_end: false,
          metadata: meta,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
      if (error) return respondDbError('revenuecat:sync:subscription-update', error)
    } else {
      const { error } = await admin
        .from('app_subscriptions')
        .insert({
          user_id: user.id,
          plan_id: resolvedPlanId,
          status: 'active',
          // provider='apple': RevenueCat é intermediário do Apple IAP e o CHECK
          // constraint de app_subscriptions.provider NÃO aceita 'revenuecat'
          // (rejeitava o INSERT com 400). Igual ao webhook. O rótulo 'revenuecat'
          // fica preservado em metadata.provider (acima).
          provider: 'apple',
          current_period_start: new Date().toISOString(),
          current_period_end: expiresDate,
          cancel_at_period_end: false,
          metadata: meta,
        })
      if (error) return respondDbError('revenuecat:sync:subscription-insert', error)
    }

    // Sync to user_entitlements (primary VIP resolution table)
    // provider='apple' because RevenueCat is intermediary for Apple IAP
    const { data: existingEnt } = await admin
      .from('user_entitlements')
      .select('id')
      .eq('user_id', user.id)
      .eq('provider', 'apple')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existingEnt?.id) {
      const { error: entUpdErr } = await admin
        .from('user_entitlements')
        .update({
          plan_id: resolvedPlanId,
          status: 'active',
          valid_until: expiresDate,
          current_period_end: expiresDate,
          metadata: meta,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingEnt.id)
      if (entUpdErr) logError('billing:revenuecat:sync:entitlement-update', entUpdErr, { userId: user.id, productId })
    } else {
      const { error: entInsErr } = await admin
        .from('user_entitlements')
        .insert({
          user_id: user.id,
          plan_id: resolvedPlanId,
          status: 'active',
          provider: 'apple',
          provider_subscription_id: productId,
          valid_from: new Date().toISOString(),
          valid_until: expiresDate,
          current_period_start: new Date().toISOString(),
          current_period_end: expiresDate,
          metadata: meta,
        })
      // 23505 = já existe (corrida do MESMO usuário): idempotente. Outro erro era
      // engolido em silêncio (o VIP não entrava na tabela primária sem ninguém saber).
      if (entInsErr && (entInsErr as { code?: string }).code !== '23505') {
        logError('billing:revenuecat:sync:entitlement-insert', entInsErr, { userId: user.id, productId })
      }
    }

    // Invalidate VIP caches so the user sees the new status immediately
    await Promise.all([
      cacheDelete(`vip:access:${user.id}`).catch(() => {}),
      cacheDelete(`dashboard:bootstrap:${user.id}`).catch(() => {}),
    ])

    return NextResponse.json({ ok: true, planId: resolvedPlanId, expiresDate })
  } catch (e: unknown) {
    logError('billing:revenuecat:sync', e)
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 400 })
  }
}
