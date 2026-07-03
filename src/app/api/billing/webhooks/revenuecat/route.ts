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
import { cacheDelete, cacheSetNx } from '@/utils/cache'
import { env } from '@/utils/env'
import { insertNotifications } from '@/lib/social/notifyFollowers'
import { waitUntil } from '@vercel/functions'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { logWarn, logError } from '@/lib/logger'
import { respondDbError } from '@/utils/api/dbError'

/**
 * Comparação constant-time (auditoria 2026-06-27, I3). `a === b` faz short-circuit
 * no 1º byte diferente — dá pra recuperar o secret medindo latência. XOR em O(n).
 */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return mismatch === 0
}

/**
 * L4: confirma direto na API da RevenueCat que o app_user_id REALMENTE tem o
 * entitlement ativo — defesa contra forja de evento de ativação se o
 * WEBHOOK_AUTH_KEY vazar. Retorna true (confirmado), false (API respondeu e NÃO
 * tem) ou null (sem secret key / API indisponível → caller segue, fail-open, pra
 * não bloquear grant legítimo num outage da RevenueCat).
 */
async function revenuecatHasActiveEntitlement(appUserId: string): Promise<boolean | null> {
  const key = String(env.revenuecat.secretKey || '').trim()
  const uid = String(appUserId || '').trim()
  if (!key || !uid) return null
  try {
    const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`, {
      headers: { Authorization: `Bearer ${key}` },
      redirect: 'manual',
    })
    if (!res.ok) return null
    const data = (await res.json()) as { subscriber?: { entitlements?: Record<string, { expires_date?: string | null }> } }
    const entId = String(env.revenuecat.entitlementId || 'vip')
    const ent = data?.subscriber?.entitlements?.[entId]
    if (!ent) return false
    const exp = ent.expires_date ? new Date(ent.expires_date).getTime() : Infinity
    return Number.isFinite(exp) ? exp > Date.now() : true
  } catch {
    return null
  }
}

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

const WEBHOOK_AUTH_KEY = env.revenuecat.webhookAuthKey.trim()

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
    // ── Rate limit per source IP ───────────────────────────────────────────
    // 60 req/min/IP — comfortable for legitimate RevenueCat retries (they
    // back off exponentially) but stops a brute-force probe of the bearer
    // token or a replay storm if the token leaks.
    const ip = getRequestIp(request)
    const rl = await checkRateLimitAsync(`webhook:revenuecat:${ip}`, 60, 60_000)
    if (!rl.allowed) {
      return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })
    }

    // The WEBHOOK_AUTH_KEY is the only thing standing between an anonymous POST
    // and a user getting VIP granted. If the secret is unset in production,
    // anyone who discovers the endpoint URL can forge an INITIAL_PURCHASE and
    // grant themselves any plan. Refuse to process the webhook until the key
    // is configured — better to drop legitimate events on the floor (RevenueCat
    // auto-retries) than to silently open a free-VIP backdoor.
    if (!WEBHOOK_AUTH_KEY) {
      return NextResponse.json(
        { ok: false, error: 'webhook_not_configured' },
        { status: 500 },
      )
    }
    const authHeader = request.headers.get('authorization') || ''
    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!safeEqual(token, WEBHOOK_AUTH_KEY)) {
      return NextResponse.json(
        { ok: false, error: 'unauthorized' },
        { status: 401 },
      )
    }

    const body = (await request.json()) as RevenueCatWebhookPayload
    const event = body?.event
    if (!event || !event.type || !event.app_user_id) {
      return NextResponse.json(
        { ok: false, error: 'invalid_payload' },
        { status: 400 },
      )
    }

    // ── Replay protection ───────────────────────────────────────────────────
    // RevenueCat includes a unique `id` on every event. cacheSetNx returns
    // true the first time we see that id; on a replay it returns false and
    // we short-circuit. The TTL (7 days) covers RevenueCat's retry window
    // with a healthy margin. Fail-closed: if Upstash is down, cacheSetNx
    // returns false → we treat as duplicate (RevenueCat will retry).
    const eventId = String((event as Record<string, unknown>).id ?? '').trim()
    if (!eventId) {
      // Real RevenueCat events always have an id; reject the rest to keep
      // the dedup path watertight.
      return NextResponse.json({ ok: false, error: 'missing_event_id' }, { status: 400 })
    }
    const isFresh = await cacheSetNx(`webhook:revenuecat:event:${eventId}`, '1', 7 * 24 * 60 * 60)
    if (!isFresh) {
      logWarn('webhook:revenuecat', 'Replay or dedup-on-outage', { eventId, type: event.type })
      return NextResponse.json({ ok: true, deduped: true })
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

    // L4: para eventos de ATIVAÇÃO, confirma o entitlement direto na API da
    // RevenueCat antes de conceder VIP. Defesa em profundidade: se o
    // WEBHOOK_AUTH_KEY vazar, um atacante não consegue forjar um INITIAL_PURCHASE
    // pra app_user_id arbitrário (a API não confirmaria). null (sem secret key /
    // API fora) → segue, pra não bloquear grant legítimo num outage.
    if (targetStatus === 'active') {
      const verified = await revenuecatHasActiveEntitlement(userId)
      if (verified === false) {
        logWarn('webhook:revenuecat', 'Ativação NÃO confirmada pela API RevenueCat — grant negado', { userId, eventId, type: eventType })
        return NextResponse.json({ ok: true, skipped: 'not_verified' })
      }
    }

    const admin = createAdminClient()

    // Resolve o plano contra app_plans. Há FK (user_entitlements.plan_id e
    // app_subscriptions.plan_id → app_plans.id): gravar um plan_id inexistente lança
    // 23503, então resolveDbPlanId (só transformação de string) NÃO basta. Tenta o
    // productId cru e o dbPlanId normalizado (mesma lógica do /revenuecat/sync).
    let resolvedPlanId: string | null = null
    for (const candidate of [...new Set([productId, dbPlanId].filter(Boolean))]) {
      const { data: plan } = await admin.from('app_plans').select('id').eq('id', candidate).maybeSingle()
      if (plan?.id) { resolvedPlanId = plan.id; break }
    }

    // Ativação com SKU cujo plano NÃO existe em app_plans (SKU novo da Apple ainda não
    // mapeado): gravar app_subscriptions/user_entitlements com esse plan_id violaria a FK
    // (23503 → 500) e a RevenueCat entraria em retry-loop, sem nunca conceder VIP nem
    // gerar alerta útil (o alerta antigo ficava DEPOIS do INSERT que dava 500 → nunca
    // rodava). Em vez disso: ALERTA (→ Sentry: ops mapeia o SKU + concede manual) e ACK
    // 200 pra encerrar o retry. O grant fica manual — honesto, pois não dá pra inferir o
    // tier — mas agora observável, e sem 500 em loop.
    if (targetStatus === 'active' && !resolvedPlanId) {
      logError(
        'webhook:revenuecat:unmapped-plan',
        new Error('active purchase with SKU not in app_plans — manual grant required'),
        { userId, productId, dbPlanId, eventType },
      )
      return NextResponse.json({ ok: true, skipped: 'unmapped_plan' })
    }

    // The app_subscriptions.provider CHECK constraint allows a fixed set of
    // values: asaas / stripe / apple / google / manual / admin / mercadopago.
    // RevenueCat is an intermediary over Apple IAP — the source of truth is
    // Apple — so we persist the subscription row with provider='apple'. The
    // fact that the event came through RevenueCat is preserved in metadata
    // (`metadata.provider = 'revenuecat'` and `product_identifier`).
    //
    // Previously this code used provider='revenuecat' directly, which was
    // rejected by the CHECK constraint at INSERT time and the handler
    // returned 500 — meaning no real iOS purchase could ever create an
    // app_subscriptions row in production. user_entitlements was fine
    // because that block (further below) already used 'apple'.

    // Find existing iOS/RC subscription for this user (new 'apple' rows
    // plus any legacy rows still tagged 'revenuecat' before this fix)
    const { data: existing } = await admin
      .from('app_subscriptions')
      .select('id, status')
      .eq('user_id', userId)
      .in('provider', ['apple', 'revenuecat'])
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
          // Só sobrescreve o plano quando resolvido; num evento inativo com plano não
          // resolvido, mantém o plan_id existente (evita FK 23503).
          ...(resolvedPlanId ? { plan_id: resolvedPlanId } : {}),
          status: targetStatus,
          current_period_end: expiresDate,
          cancel_at_period_end: targetStatus === 'canceled',
          metadata: meta,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
      if (error) {
        return respondDbError('revenuecat:webhook:subscription-update', error, 500)
      }
    } else if (targetStatus === 'active') {
      // Only create new subscription record for activation events
      const { error } = await admin
        .from('app_subscriptions')
        .insert({
          user_id: userId,
          // Ativação passou pelo guard acima → resolvedPlanId garantido non-null.
          plan_id: resolvedPlanId as string,
          status: 'active',
          provider: 'apple',
          current_period_start: new Date().toISOString(),
          current_period_end: expiresDate,
          cancel_at_period_end: false,
          metadata: meta,
        })
      if (error) {
        return respondDbError('revenuecat:webhook:subscription-insert', error, 500)
      }
    }

    // Sync to user_entitlements (primary VIP resolution table)
    // provider must be 'apple' (RevenueCat is an intermediary for Apple IAP)
    // status mapping: active→active, canceled→cancelled, expired→inactive
    // Ativação com SKU não mapeado já retornou acima (com alerta). Aqui, pra ATIVAÇÃO o
    // resolvedPlanId está garantido; pra evento inativo só mudamos o status (o plan_id só
    // é sobrescrito quando resolvido, evitando FK 23503 num evento de plano não mapeado).
    {
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
        const { error: entUpdErr } = await admin
          .from('user_entitlements')
          .update({
            ...(resolvedPlanId ? { plan_id: resolvedPlanId } : {}),
            status: entStatus,
            valid_until: expiresDate,
            current_period_end: expiresDate,
            metadata: meta,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingEnt.id)
        if (entUpdErr) logError('webhook:revenuecat:entitlement-update', entUpdErr, { userId, productId, eventType })
      } else if (targetStatus === 'active') {
        const { error: entInsErr } = await admin
          .from('user_entitlements')
          .insert({
            user_id: userId,
            plan_id: resolvedPlanId as string,
            status: 'active',
            provider: 'apple',
            provider_subscription_id: productId,
            valid_from: new Date().toISOString(),
            valid_until: expiresDate,
            current_period_start: new Date().toISOString(),
            current_period_end: expiresDate,
            metadata: meta,
          })
        // 23505 = já existe (re-entrega/corrida do MESMO usuário): idempotente, ok.
        // Qualquer OUTRO erro era ENGOLIDO em silêncio (200 OK mascarava a falha do
        // VIP na tabela primária) — agora loga (→ Sentry). O bug crítico (colisão
        // ENTRE usuários pelo SKU) foi fechado pela migration que incluiu user_id.
        if (entInsErr && (entInsErr as { code?: string }).code !== '23505') {
          logError('webhook:revenuecat:entitlement-insert', entInsErr, { userId, productId, eventType })
        }
      }
    }

    // Invalidate VIP caches
    await Promise.all([
      cacheDelete(`vip:access:${userId}`).catch(() => {}),
      cacheDelete(`dashboard:bootstrap:${userId}`).catch(() => {}),
    ])

    // Read-only addition: notify the user when RevenueCat reports a billing
    // failure. Does not modify the billing flow — only piggybacks on the
    // existing webhook to surface a self push.
    if (eventType === 'BILLING_ISSUE') {
      waitUntil(
        insertNotifications([{
          user_id: userId,
          recipient_id: userId,
          sender_id: userId,
          type: 'billing_issue',
          title: 'Falha no pagamento',
          message: 'Não conseguimos cobrar sua assinatura. Atualize seus dados pra manter o VIP.',
          is_read: false,
          metadata: { event_type: eventType, product_id: productId },
        }]).catch(() => { }),
      )
    }

    return NextResponse.json({ ok: true, event: eventType, status: targetStatus })
  } catch (e: unknown) {
    logError('webhook:revenuecat', e)
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
