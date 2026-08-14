/**
 * POST /api/billing/webhooks/revenuecat
 *
 * Handles RevenueCat server-to-server webhook notifications.
 * Events: INITIAL_PURCHASE, RENEWAL, CANCELLATION, EXPIRATION, etc.
 *
 * Docs: https://www.revenuecat.com/docs/integrations/webhooks
 *
 * Semântica corrigida na auditoria de cobranças de 14/08/2026:
 *  - CANCELLATION = auto-renew DESLIGADO, não expiração. O cliente pagou até
 *    expiration_at_ms e mantém acesso até lá (cancel_at_period_end=true). A
 *    exceção é reembolso (cancel_reason=CUSTOMER_SUPPORT), que corta na hora.
 *  - BILLING_ISSUE = retry/grace period, não expiração. Vira past_due (o
 *    resolvedor VIP aceita past_due) e, com grace_period_expiration_at_ms, a
 *    janela anda até o fim do grace. Revogar aqui tirava VIP de quem o retry
 *    da Apple ainda ia cobrar.
 *  - EXPIRATION é o único evento que encerra o acesso.
 * Os statuses gravados PRECISAM existir nos CHECKs do banco: o código antigo
 * escrevia 'canceled'/'expired' (que não existem em app_subscriptions_status_check),
 * o update falhava com 23514 e — com o dedup já marcado — o evento se perdia de
 * vez. É por isso que produção tinha assinaturas Apple presas em 'active' com o
 * período vencido.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { cacheDelete, cacheSetNxStatus } from '@/utils/cache'
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
  cancel_reason?: string
  grace_period_expiration_at_ms?: number | null
  original_transaction_id?: string
  event_timestamp_ms?: number
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

// Statuses permitidos pelos CHECKs do banco (app_subscriptions_status_check /
// user_entitlements_status_check). Qualquer valor fora daqui falha com 23514.
type SubStatus = 'active' | 'past_due' | 'cancelled' | 'inactive'
type EntStatus = 'active' | 'past_due' | 'cancelled' | 'inactive'

type Decision = {
  kind: 'grant' | 'schedule_cancel' | 'refund_revoke' | 'past_due' | 'expire'
  subStatus: SubStatus
  entStatus: EntStatus
  /** null = não tocar em cancel_at_period_end */
  cancelAtPeriodEnd: boolean | null
  /** null = não tocar na janela (valid_until/current_period_end) */
  windowIso: string | null
}

function decideEffect(eventType: string, event: RevenueCatEvent): Decision | null {
  const expiresMs = event.expiration_at_ms ?? null
  const windowIso = expiresMs && Number.isFinite(expiresMs) ? new Date(expiresMs).toISOString() : null

  if (ACTIVE_EVENTS.has(eventType)) {
    return { kind: 'grant', subStatus: 'active', entStatus: 'active', cancelAtPeriodEnd: false, windowIso }
  }
  if (eventType === 'CANCELLATION') {
    // CUSTOMER_SUPPORT = reembolso: o dinheiro voltou, o acesso cai junto.
    if (String(event.cancel_reason || '').trim().toUpperCase() === 'CUSTOMER_SUPPORT') {
      return { kind: 'refund_revoke', subStatus: 'cancelled', entStatus: 'cancelled', cancelAtPeriodEnd: true, windowIso: null }
    }
    // Auto-renew desligado: acesso segue até o fim do período pago; o
    // resolvedor corta sozinho quando valid_until passar.
    return { kind: 'schedule_cancel', subStatus: 'active', entStatus: 'active', cancelAtPeriodEnd: true, windowIso }
  }
  if (eventType === 'BILLING_ISSUE') {
    const graceMs = event.grace_period_expiration_at_ms ?? null
    const graceIso = graceMs && Number.isFinite(graceMs) ? new Date(graceMs).toISOString() : null
    return { kind: 'past_due', subStatus: 'past_due', entStatus: 'past_due', cancelAtPeriodEnd: null, windowIso: graceIso }
  }
  if (eventType === 'EXPIRATION') {
    return { kind: 'expire', subStatus: 'inactive', entStatus: 'inactive', cancelAtPeriodEnd: false, windowIso }
  }
  return null
}

function metaOf(row: { metadata?: unknown } | null | undefined): Record<string, unknown> {
  return row?.metadata && typeof row.metadata === 'object' ? (row.metadata as Record<string, unknown>) : {}
}

/**
 * Evento fora de ordem: se a linha já registrou um evento MAIS NOVO
 * (event_timestamp_ms), um evento antigo reentregue não pode rebobinar o estado
 * (auditoria 14/08/2026, A6 — "evento antigo atinge a assinatura mais nova").
 */
function isStaleForRow(rowMeta: Record<string, unknown>, eventMs: number | null): boolean {
  if (eventMs === null) return false
  const prev = Number(rowMeta.event_timestamp_ms)
  return Number.isFinite(prev) && eventMs < prev
}

/**
 * A linha pertence a OUTRA cadeia de compra (original_transaction_id diferente).
 * Um CANCELLATION/EXPIRATION da assinatura antiga não pode derrubar a recompra.
 */
function isForeignChain(rowMeta: Record<string, unknown>, oti: string): boolean {
  const stored = String(rowMeta.original_transaction_id || '').trim()
  return Boolean(oti && stored && stored !== oti)
}

export async function POST(request: NextRequest) {
  let dedupKey: string | null = null
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
    // RevenueCat inclui um `id` único em todo evento. O dedup tem DOIS modos de
    // falha com respostas distintas (A3 da auditoria de 14/08/2026):
    //  - 'exists' → duplicata real → 200 deduped;
    //  - 'unavailable' (Upstash fora) → 503 + Retry-After, para a RevenueCat
    //    REENVIAR. O código antigo respondia 200 deduped no outage — toda
    //    compra da janela era descartada com cara de sucesso.
    // E se o processamento falhar DEPOIS de marcar a chave, ela é liberada no
    // fim do handler — senão o retry levaria `200 deduped` e o evento se
    // perderia para sempre.
    const eventId = String((event as Record<string, unknown>).id ?? '').trim()
    if (!eventId) {
      // Real RevenueCat events always have an id; reject the rest to keep
      // the dedup path watertight.
      return NextResponse.json({ ok: false, error: 'missing_event_id' }, { status: 400 })
    }
    dedupKey = `webhook:revenuecat:event:${eventId}`
    const dedup = await cacheSetNxStatus(dedupKey, '1', 7 * 24 * 60 * 60)
    if (dedup === 'unavailable') {
      logWarn('webhook:revenuecat', 'Dedup indisponível (Upstash fora) — 503 para retry', { eventId, type: event.type })
      return NextResponse.json(
        { ok: false, error: 'dedup_unavailable' },
        { status: 503, headers: { 'Retry-After': '60' } },
      )
    }
    if (dedup === 'exists') {
      logWarn('webhook:revenuecat', 'Replay dedupado', { eventId, type: event.type })
      return NextResponse.json({ ok: true, deduped: true })
    }

    const res = await processEvent(event)
    if (res.status >= 500) {
      await cacheDelete(dedupKey).catch(() => {})
    }
    return res
  } catch (e: unknown) {
    logError('webhook:revenuecat', e)
    if (dedupKey) await cacheDelete(dedupKey).catch(() => {})
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

async function processEvent(event: RevenueCatEvent): Promise<NextResponse> {
  const userId = String(event.app_user_id).trim()
  const productId = String(event.product_id || '').trim()
  const dbPlanId = resolveDbPlanId(productId)
  const eventType = String(event.type).toUpperCase()

  const decision = decideEffect(eventType, event)
  // Skip events we don't handle (TEST, SUBSCRIBER_ALIAS, TRANSFER, etc.)
  if (!decision) {
    return NextResponse.json({ ok: true, skipped: true })
  }

  const oti = String(event.original_transaction_id || '').trim()
  const eventMsRaw = Number(event.event_timestamp_ms)
  const eventMs = Number.isFinite(eventMsRaw) ? eventMsRaw : null

  // L4: para eventos de ATIVAÇÃO, confirma o entitlement direto na API da
  // RevenueCat antes de conceder VIP. Defesa em profundidade: se o
  // WEBHOOK_AUTH_KEY vazar, um atacante não consegue forjar um INITIAL_PURCHASE
  // pra app_user_id arbitrário (a API não confirmaria). null (sem secret key /
  // API fora) → segue, pra não bloquear grant legítimo num outage.
  if (decision.kind === 'grant') {
    const verified = await revenuecatHasActiveEntitlement(userId)
    if (verified === false) {
      logWarn('webhook:revenuecat', 'Ativação NÃO confirmada pela API RevenueCat — grant negado', { userId, eventId: event.id, type: eventType })
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
    const { data: plan, error: planErr } = await admin.from('app_plans').select('id').eq('id', candidate).maybeSingle()
    // Erro de query (hiccup do DB, não "SKU desconhecido") → logWarn pra distinguir do
    // alerta unmapped-plan no diagnóstico. Não interrompe: tenta o próximo candidato.
    if (planErr) logWarn('webhook:revenuecat', 'app_plans lookup failed', { candidate, error: planErr.message })
    if (plan?.id) { resolvedPlanId = plan.id; break }
  }

  // Evento ATIVO com SKU cujo plano NÃO existe em app_plans (SKU novo da Apple ainda não
  // mapeado). Gravar linha NOVA com esse plan_id violaria a FK (23503 → 500 em loop): por
  // isso os INSERTs abaixo só rodam com resolvedPlanId. Os UPDATEs usam plan_id
  // condicional e RENOVAM a JANELA de uma assinatura/entitlement existente sem tocar no
  // plano. O alerta PÓS-bloco distingue renovação-ok (warn) do órfão sem linha (error).
  const unmappedActive = decision.kind === 'grant' && !resolvedPlanId
  let renewedExistingEnt = false

  const meta = {
    provider: 'revenuecat',
    product_identifier: productId,
    event_type: eventType,
    entitlement_ids: event.entitlement_ids || [],
    ...(oti ? { original_transaction_id: oti } : {}),
    ...(eventMs !== null ? { event_timestamp_ms: eventMs } : {}),
    webhook_processed_at: new Date().toISOString(),
  }

  // The app_subscriptions.provider CHECK constraint allows a fixed set of
  // values: asaas / stripe / apple / google / manual / admin / mercadopago.
  // RevenueCat is an intermediary over Apple IAP — the source of truth is
  // Apple — so we persist the subscription row with provider='apple'.
  //
  // Seleção da linha (A6): prefere a linha da MESMA cadeia de compra
  // (metadata.original_transaction_id); só cai na "mais recente" quando a cadeia
  // não está registrada (linhas antigas, de antes deste campo existir).
  let existing: { id: string; status?: string; metadata?: unknown } | null = null
  let subMatchedByChain = false
  if (oti) {
    const { data } = await admin
      .from('app_subscriptions')
      .select('id, status, metadata')
      .eq('user_id', userId)
      .in('provider', ['apple', 'revenuecat'])
      .contains('metadata', { original_transaction_id: oti })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (data?.id) { existing = data; subMatchedByChain = true }
  }
  if (!existing) {
    const { data } = await admin
      .from('app_subscriptions')
      .select('id, status, metadata')
      .eq('user_id', userId)
      .in('provider', ['apple', 'revenuecat'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    existing = data ?? null
  }

  let subSkipReason: string | null = null
  if (existing?.id) {
    const rowMeta = metaOf(existing)
    if (isStaleForRow(rowMeta, eventMs)) {
      subSkipReason = 'stale_event'
    } else if (decision.kind !== 'grant' && !subMatchedByChain && isForeignChain(rowMeta, oti)) {
      // Cancelamento/expiração de uma cadeia antiga não derruba a recompra que
      // hoje é dona da linha. Compra nova (grant) pode assumir a linha.
      subSkipReason = 'foreign_chain'
    }
  }

  if (existing?.id && !subSkipReason) {
    const { error } = await admin
      .from('app_subscriptions')
      .update({
        // Só sobrescreve o plano quando resolvido; num evento com plano não
        // resolvido, mantém o plan_id existente (evita FK 23503).
        ...(resolvedPlanId ? { plan_id: resolvedPlanId } : {}),
        status: decision.subStatus,
        // Janela: só quando o evento trouxe uma data. Escrever null aqui
        // criava assinatura "sem prazo" que o fallback legado trata como
        // ilimitada — mesma classe do bug do valid_until no entitlement.
        ...(decision.windowIso !== null ? { current_period_end: decision.windowIso } : {}),
        ...(decision.cancelAtPeriodEnd !== null ? { cancel_at_period_end: decision.cancelAtPeriodEnd } : {}),
        metadata: { ...metaOf(existing), ...meta },
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
    if (error) {
      return respondDbError('revenuecat:webhook:subscription-update', error, 500)
    }
  } else if (!existing?.id && decision.kind === 'grant' && resolvedPlanId && decision.windowIso) {
    // Só cria assinatura nova em ativação COM plano resolvido e COM janela —
    // linha nova sem current_period_end viraria acesso sem prazo no fallback.
    const { error } = await admin
      .from('app_subscriptions')
      .insert({
        user_id: userId,
        plan_id: resolvedPlanId,
        status: 'active',
        provider: 'apple',
        current_period_start: new Date().toISOString(),
        current_period_end: decision.windowIso,
        cancel_at_period_end: false,
        metadata: meta,
      })
    if (error) {
      return respondDbError('revenuecat:webhook:subscription-insert', error, 500)
    }
  } else if (!existing?.id && decision.kind === 'grant' && resolvedPlanId && !decision.windowIso) {
    // C5: ativação sem expiration_at_ms não cria linha — seria acesso sem prazo
    // por acidente. Vitalício de verdade é concessão manual (metadata.lifetime_grant).
    logError('webhook:revenuecat:active-sem-expiracao', new Error('ativação sem expiration_at_ms — não criei assinatura; se for vitalício de verdade, conceda manualmente'), { userId, productId, eventType })
  }

  // Sync to user_entitlements (primary VIP resolution table)
  // provider must be 'apple' (RevenueCat is an intermediary for Apple IAP).
  // Seleção (A6): prefere o entitlement do MESMO produto (as linhas Apple são
  // chaveadas por provider_subscription_id=productId); fallback: mais recente.
  let entSkipReason: string | null = null
  {
    let existingEnt: { id: string; metadata?: unknown } | null = null
    let entMatchedByProduct = false
    if (productId) {
      const { data } = await admin
        .from('user_entitlements')
        .select('id, metadata')
        .eq('user_id', userId)
        .eq('provider', 'apple')
        .eq('provider_subscription_id', productId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (data?.id) { existingEnt = data; entMatchedByProduct = true }
    }
    if (!existingEnt) {
      const { data } = await admin
        .from('user_entitlements')
        .select('id, metadata')
        .eq('user_id', userId)
        .eq('provider', 'apple')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      existingEnt = data ?? null
    }

    if (existingEnt?.id) {
      const entMeta = metaOf(existingEnt)
      if (entMeta.lifetime_grant === true) {
        // Grant vitalício é decisão ADMINISTRATIVA (ex.: conta do App Review) —
        // o webhook não rebaixa nem data uma concessão dessas. Ver auditoria
        // 14/08/2026 (C5): o único valid_until=null de produção é intencional.
        entSkipReason = 'lifetime_grant'
        logWarn('webhook:revenuecat', 'Entitlement lifetime_grant — evento ignorado para a linha', { userId, productId, eventType })
      } else if (isStaleForRow(entMeta, eventMs)) {
        entSkipReason = 'stale_event'
      } else if (decision.kind !== 'grant' && !entMatchedByProduct && isForeignChain(entMeta, oti)) {
        entSkipReason = 'foreign_chain'
      }
    }

    if (existingEnt?.id && !entSkipReason) {
      renewedExistingEnt = true
      const { error: entUpdErr } = await admin
        .from('user_entitlements')
        .update({
          ...(resolvedPlanId ? { plan_id: resolvedPlanId } : {}),
          status: decision.entStatus,
          // Janela: só quando o evento trouxe data. Num evento ativo SEM
          // expiração (RENEWAL malformado), não sobrescreve com null —
          // valid_until=null resolveria como VIP vitalício.
          ...(decision.windowIso !== null ? { valid_until: decision.windowIso, current_period_end: decision.windowIso } : {}),
          metadata: { ...metaOf(existingEnt), ...meta },
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingEnt.id)
      if (entUpdErr) {
        // Tabela PRIMÁRIA do VIP: falha aqui não pode virar 200 (o provedor não
        // reenviaria). 500 → dedup liberado no handler → retry reprocessa.
        return respondDbError('revenuecat:webhook:entitlement-update', entUpdErr, 500)
      }
    } else if (!existingEnt?.id && decision.kind === 'grant' && resolvedPlanId) {
      if (!decision.windowIso) {
        // C5: entitlement ativo sem expiração = VIP vitalício por acidente.
        logError('webhook:revenuecat:entitlement-sem-expiracao', new Error('ativação sem expiration_at_ms — entitlement não criado; vitalício exige concessão manual (metadata.lifetime_grant)'), { userId, productId, eventType })
      } else {
        const { error: entInsErr } = await admin
          .from('user_entitlements')
          .insert({
            user_id: userId,
            plan_id: resolvedPlanId,
            status: 'active',
            provider: 'apple',
            provider_subscription_id: productId,
            valid_from: new Date().toISOString(),
            valid_until: decision.windowIso,
            current_period_start: new Date().toISOString(),
            current_period_end: decision.windowIso,
            metadata: meta,
          })
        // 23505 = já existe (re-entrega/corrida do MESMO usuário): idempotente, ok.
        if (entInsErr && (entInsErr as { code?: string }).code !== '23505') {
          return respondDbError('revenuecat:webhook:entitlement-insert', entInsErr, 500)
        }
      }
    }
  }

  // Alerta do SKU não mapeado, com nível conforme o desfecho: renovação da JANELA de uma
  // linha existente = warn (funcionou; só falta mapear o SKU pro tier resolver certo);
  // ativação de usuário SEM linha prévia = error (órfão, precisa de grant manual). Evita
  // ruído de erro no Sentry a cada renovação legítima de um SKU não mapeado.
  if (unmappedActive) {
    if (renewedExistingEnt) {
      logWarn('webhook:revenuecat', 'active event with SKU not in app_plans — existing entitlement window renewed; map the SKU so the tier resolves', { userId, productId, dbPlanId, eventType })
    } else {
      logError('webhook:revenuecat:unmapped-plan', new Error('active event with SKU not in app_plans and no existing entitlement — manual grant required'), { userId, productId, dbPlanId, eventType })
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

  return NextResponse.json({
    ok: true,
    event: eventType,
    action: decision.kind,
    status: decision.subStatus,
    ...(subSkipReason ? { sub_skipped: subSkipReason } : {}),
    ...(entSkipReason ? { ent_skipped: entSkipReason } : {}),
  })
}
