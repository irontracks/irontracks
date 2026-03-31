/**
 * POST /api/billing/webhooks/revenuecat
 *
 * Handles RevenueCat server-to-server webhook notifications.
 * Events: INITIAL_PURCHASE, RENEWAL, CANCELLATION, EXPIRATION, etc.
 *
 * Docs: https://www.revenuecat.com/docs/integrations/webhooks
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { cacheDelete } from '@/utils/cache'

/**
 * Maps Apple/RevenueCat product identifiers to app_plans.id values.
 * e.g. "vip_pro_monthly" → "vip_pro", "vip_pro_year" → "vip_pro_annual"
 */
function resolveDbPlanId(productId: string): string {
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

interface RevenueCatEvent {
  type: string
  app_user_id: string
  product_id: string
  entitlement_ids?: string[]
  expiration_at_ms?: number
  [key: string]: unknown
}

interface RevenueCatWebhookPayload {
  api_version: string
  event: RevenueCatEvent
}

const WEBHOOK_AUTH_KEY = String(
  process.env.REVENUECAT_WEBHOOK_AUTH_KEY || '',
).trim()

const ACTIVE_EVENTS = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'UNCANCELLATION',
  'NON_RENEWING_PURCHASE',
  'PRODUCT_CHANGE',
])

const INACTIVE_EVENTS = new Set([
  'CANCELLATION',
  'EXPIRATION',
  'BILLING_ISSUE',
])

export async function POST(request: NextRequest) {
  try {
    // Optional: Verify webhook auth header
    if (WEBHOOK_AUTH_KEY) {
      const authHeader = request.headers.get('authorization') || ''
      const token = authHeader.replace(/^Bearer\s+/i, '').trim()
      if (token !== WEBHOOK_AUTH_KEY) {
        return NextResponse.json(
          { ok: false, error: 'unauthorized' },
          { status: 401 },
        )
      }
    }

    const body = (await request.json()) as RevenueCatWebhookPayload
    const event = body?.event
    if (!event || !event.type || !event.app_user_id) {
      return NextResponse.json(
        { ok: false, error: 'invalid_payload' },
        { status: 400 },
      )
    }

    const userId = String(event.app_user_id).trim()
    const productId = String(event.product_id || '').trim()
    const dbPlanId = resolveDbPlanId(productId)
    const eventType = String(event.type).toUpperCase()
    const expiresMs = event.expiration_at_ms ?? null
    const expiresDate = expiresMs && Number.isFinite(expiresMs)
      ? new Date(expiresMs).toISOString()
      : null

    // Determine target status based on event type
    let targetStatus: 'active' | 'canceled' | 'expired' | null = null
    if (ACTIVE_EVENTS.has(eventType)) {
      targetStatus = 'active'
    } else if (INACTIVE_EVENTS.has(eventType)) {
      if (eventType === 'CANCELLATION') {
        targetStatus = 'canceled'
      } else {
        targetStatus = 'expired'
      }
    }

    // Skip events we don't handle (TEST, SUBSCRIBER_ALIAS, etc.)
    if (!targetStatus) {
      return NextResponse.json({ ok: true, skipped: true })
    }

    const admin = createAdminClient()

    // Find existing RevenueCat subscription for this user
    const { data: existing } = await admin
      .from('app_subscriptions')
      .select('id, status')
      .eq('user_id', userId)
      .eq('provider', 'revenuecat')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const meta = {
      provider: 'revenuecat',
      product_identifier: productId,
      event_type: eventType,
      entitlement_ids: event.entitlement_ids || [],
      webhook_processed_at: new Date().toISOString(),
    }

    if (existing?.id) {
      const { error } = await admin
        .from('app_subscriptions')
        .update({
          plan_id: dbPlanId || productId || undefined,
          status: targetStatus,
          current_period_end: expiresDate,
          cancel_at_period_end: targetStatus === 'canceled',
          metadata: meta,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
      if (error) {
        return NextResponse.json(
          { ok: false, error: error.message },
          { status: 500 },
        )
      }
    } else if (targetStatus === 'active') {
      // Only create new subscription record for activation events
      const { error } = await admin
        .from('app_subscriptions')
        .insert({
          user_id: userId,
          plan_id: dbPlanId || productId,
          status: 'active',
          provider: 'revenuecat',
          current_period_start: new Date().toISOString(),
          current_period_end: expiresDate,
          cancel_at_period_end: false,
          metadata: meta,
        })
      if (error) {
        return NextResponse.json(
          { ok: false, error: error.message },
          { status: 500 },
        )
      }
    }

    // Sync to user_entitlements (primary VIP resolution table)
    // provider must be 'apple' (RevenueCat is an intermediary for Apple IAP)
    // status mapping: active→active, canceled→cancelled, expired→inactive
    if (dbPlanId) {
      const entStatus = targetStatus === 'active' ? 'active' : targetStatus === 'canceled' ? 'cancelled' : 'inactive'
      const { data: existingEnt } = await admin
        .from('user_entitlements')
        .select('id')
        .eq('user_id', userId)
        .eq('provider', 'apple')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (existingEnt?.id) {
        await admin
          .from('user_entitlements')
          .update({
            plan_id: dbPlanId,
            status: entStatus,
            valid_until: expiresDate,
            current_period_end: expiresDate,
            metadata: meta,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingEnt.id)
      } else if (targetStatus === 'active') {
        await admin
          .from('user_entitlements')
          .insert({
            user_id: userId,
            plan_id: dbPlanId,
            status: 'active',
            provider: 'apple',
            provider_subscription_id: productId,
            valid_from: new Date().toISOString(),
            valid_until: expiresDate,
            current_period_start: new Date().toISOString(),
            current_period_end: expiresDate,
            metadata: meta,
          })
      }
    }

    // Invalidate VIP caches
    await Promise.all([
      cacheDelete(`vip:access:${userId}`).catch(() => {}),
      cacheDelete(`dashboard:bootstrap:${userId}`).catch(() => {}),
    ])

    return NextResponse.json({ ok: true, event: eventType, status: targetStatus })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
