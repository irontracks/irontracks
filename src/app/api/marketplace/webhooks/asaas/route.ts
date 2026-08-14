/**
 * POST /api/marketplace/webhooks/asaas
 *
 * Auditoria de cobranças 14/08/2026 (C2/C3):
 *  - O header oficial do Asaas é `asaas-access-token` (o authToken configurado
 *    no painel/API deles chega NELE). O handler aceitava só `x-webhook-secret`,
 *    um nome que o Asaas nunca envia — com o canal configurado, TODO evento
 *    legítimo levaria 401. O header legado continua aceito por compat.
 *  - O upsert de entitlement usava onConflict 'provider,provider_subscription_id',
 *    que NÃO tem índice único correspondente (o índice real é
 *    user_id,provider,provider_subscription_id) → PostgreSQL 42P10 em toda
 *    execução, erro engolido e evento marcado como processado.
 *  - Agora TODA escrita de efeito confere { error }; falha grava
 *    processing_error na linha do evento (processed_at fica NULL) e responde
 *    500 — o Asaas pausa a fila e reenvia. Dedup virou ledger de verdade:
 *    duplicata só é descartada se a entrega anterior CONCLUIU (processed_at);
 *    senão reprocessa sobre a mesma linha.
 */
import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { z } from 'zod'
import { createAdminClient } from '@/utils/supabase/admin'
import { parseJsonBody } from '@/utils/zod'
import { cacheDelete } from '@/utils/cache'
import { logWarn, logError } from '@/lib/logger'
import { env } from '@/utils/env'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'

export const dynamic = 'force-dynamic'

const safeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
  } catch {
    return false
  }
}

const mapSubscriptionStatusFromPayment = (status: string) => {
  const s = (status || '').toUpperCase()
  if (['RECEIVED', 'CONFIRMED'].includes(s)) return 'active'
  if (['OVERDUE'].includes(s)) return 'past_due'
  if (['CANCELED', 'CANCELLED', 'REFUNDED', 'CHARGEBACK', 'DELETED'].includes(s)) return 'cancelled'
  return 'pending'
}

const BodySchema = z
  .object({
    event: z.string().optional(),
    type: z.string().optional(),
    eventType: z.string().optional(),
    id: z.string().optional(),
    eventId: z.string().optional(),
    payment: z.unknown().optional(),
    data: z
      .object({
        payment: z.unknown().optional(),
      })
      .optional(),
  })
  .passthrough()

export async function POST(req: Request) {
  // ── Rate limit per source IP ───────────────────────────────────────────
  // Even with a valid HMAC, a leaked secret + replay storm could thrash the
  // database. 60 requests/min/IP is enough for legitimate Asaas retries
  // (they batch up to a few per minute) but blocks brute-force / replay.
  const ip = getRequestIp(req)
  const rl = await checkRateLimitAsync(`webhook:asaas:${ip}`, 60, 60_000)
  if (!rl.allowed) {
    return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })
  }

  const secret = env.asaas.webhookSecret.trim()
  // Header oficial do Asaas primeiro; o nome legado fica por compat com
  // qualquer chamador interno antigo.
  const provided = (req.headers.get('asaas-access-token') || req.headers.get('x-webhook-secret') || '').trim()
  if (!secret) {
    return NextResponse.json({ ok: false, error: 'webhook_not_configured' }, { status: 500 })
  }
  if (!provided || !safeEqual(provided, secret)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const parsedBody = await parseJsonBody(req, BodySchema)
  if (parsedBody.response) return parsedBody.response
  const body = parsedBody.data!

  const eventType = (body?.event || body?.type || body?.eventType || '') as string
  const eventId = (body?.id || body?.eventId || null) as string | null
  const payment = (body?.payment || body?.data?.payment || null) as Record<string, unknown> | null
  const paymentId = (payment?.id || null) as string | null
  const paymentStatus = (payment?.status || '') as string
  const subscriptionId = (payment?.subscription || null) as string | null

  // ── Reject events without an ID ─────────────────────────────────────────
  // Real Asaas webhooks always include an event id. Accepting null here would
  // bypass the unique-index dedup below (every null becomes a fresh row), so
  // an attacker who learned the secret could replay payment-confirmed events
  // without limit. We require an id and let the unique index in
  // asaas_webhook_events.asaas_event_id deduplicate retries.
  if (!eventId) {
    return NextResponse.json({ ok: false, error: 'missing_event_id' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Falha de efeito: grava processing_error na linha do evento (processed_at
  // fica NULL — a reentrega REPROCESSA) e responde 500 para o Asaas reenviar.
  const failEvent = async (eventRowId: string | null, scope: string, error: unknown) => {
    logError(scope, error)
    if (eventRowId) {
      try {
        await admin
          .from('asaas_webhook_events')
          .update({ processing_error: (error as { message?: string })?.message ?? String(error) })
          .eq('id', eventRowId)
      } catch { /* best-effort: o 500 abaixo já provoca a reentrega */ }
    }
    return NextResponse.json({ ok: false, error: 'db_error' }, { status: 500 })
  }

  let eventRowId: string | null = null
  try {
    const { data: inserted, error: insertErr } = await admin
      .from('asaas_webhook_events')
      .insert({
        asaas_event_id: eventId,
        event_type: eventType || null,
        payment_id: paymentId,
        payload: body,
      })
      .select('id')
      .single()

    if (insertErr) {
      const code = (insertErr as unknown as { code?: string })?.code
      const msg = insertErr.message || ''
      if (code === '23505' || msg.toLowerCase().includes('duplicate')) {
        // Duplicata só é descartável se a entrega anterior CONCLUIU. Se o
        // processamento anterior morreu no meio (processed_at NULL), o retry
        // do Asaas é a única chance de terminar o trabalho — reprocessa
        // sobre a mesma linha em vez de responder deduped.
        const { data: prior } = await admin
          .from('asaas_webhook_events')
          .select('id, processed_at')
          .eq('asaas_event_id', eventId)
          .maybeSingle()
        if (!prior?.id || prior.processed_at) {
          return NextResponse.json({ ok: true, deduped: true })
        }
        eventRowId = String(prior.id)
      } else {
        return NextResponse.json({ ok: false, error: msg }, { status: 400 })
      }
    } else {
      eventRowId = inserted?.id ? String(inserted.id) : null
    }

    if (!paymentId) {
      const { error } = await admin.from('asaas_webhook_events').update({ processed_at: new Date().toISOString() }).eq('id', eventRowId)
      if (error) return failEvent(eventRowId, 'asaas_webhook:mark-processed', error)
      return NextResponse.json({ ok: true, processed: false })
    }

    const updates: Record<string, unknown> = {
      status: paymentStatus || 'pending',
    }
    if (payment?.dueDate) updates.due_date = payment.dueDate
    if (payment?.invoiceUrl) updates.invoice_url = payment.invoiceUrl
    if (payment?.billingType) updates.billing_type = payment.billingType
    if (payment && (payment.pixQrCode as Record<string, unknown>)?.encodedImage) updates.pix_qr_code = (payment.pixQrCode as Record<string, unknown>).encodedImage
    if (payment && (payment.pixQrCode as Record<string, unknown>)?.payload) updates.pix_payload = (payment.pixQrCode as Record<string, unknown>).payload
    if (payment?.paymentDate) updates.paid_at = payment.paymentDate
    if (payment?.confirmedDate && !updates.paid_at) updates.paid_at = payment.confirmedDate

    const { data: payRow, error: mpPayErr } = await admin
      .from('marketplace_payments')
      .update(updates)
      .eq('asaas_payment_id', paymentId)
      .select('id, subscription_id')
      .maybeSingle()
    if (mpPayErr) return failEvent(eventRowId, 'asaas_webhook:marketplace-payment', mpPayErr)

    const { data: appPayRow, error: appPayErr } = payRow
      ? { data: null as Record<string, unknown> | null, error: null }
      : await admin
        .from('app_payments')
        .update(updates)
        .eq('asaas_payment_id', paymentId)
        .select('id, subscription_id')
        .maybeSingle()
    if (appPayErr) return failEvent(eventRowId, 'asaas_webhook:app-payment', appPayErr)
    if (!payRow?.id && !appPayRow?.id) {
      const { error } = await admin.from('app_payments').update(updates).eq('provider', 'asaas').eq('provider_payment_id', paymentId)
      if (error) return failEvent(eventRowId, 'asaas_webhook:app-payment-by-provider', error)
    }

    const subStatus = mapSubscriptionStatusFromPayment(paymentStatus)
    const subTargetId = subscriptionId
    if (subTargetId) {
      const { error } = await admin
        .from('marketplace_subscriptions')
        .update({ status: subStatus, updated_at: new Date().toISOString() })
        .eq('asaas_subscription_id', subTargetId)
      if (error) return failEvent(eventRowId, 'asaas_webhook:marketplace-sub', error)
    } else if (payRow?.subscription_id) {
      const { error } = await admin
        .from('marketplace_subscriptions')
        .update({ status: subStatus, updated_at: new Date().toISOString() })
        .eq('id', payRow.subscription_id)
      if (error) return failEvent(eventRowId, 'asaas_webhook:marketplace-sub-by-payment', error)
    }

    if (subTargetId) {
      {
        const { error } = await admin
          .from('app_subscriptions')
          .update({ status: subStatus, updated_at: new Date().toISOString() })
          .eq('asaas_subscription_id', subTargetId)
        if (error) return failEvent(eventRowId, 'asaas_webhook:app-sub-legacy', error)
      }
      {
        const { error } = await admin
          .from('app_subscriptions')
          .update({ status: subStatus, updated_at: new Date().toISOString() })
          .eq('provider', 'asaas')
          .eq('provider_subscription_id', subTargetId)
        if (error) return failEvent(eventRowId, 'asaas_webhook:app-sub', error)
      }
    } else if ((appPayRow as Record<string, unknown>)?.subscription_id) {
      const { error } = await admin
        .from('app_subscriptions')
        .update({ status: subStatus, updated_at: new Date().toISOString() })
        .eq('id', (appPayRow as Record<string, unknown>)?.subscription_id)
      if (error) return failEvent(eventRowId, 'asaas_webhook:app-sub-by-payment', error)
    }

    if (subTargetId) {
      const { data: subRow, error: subReadErr } = await admin
        .from('app_subscriptions')
        .select('user_id, plan_id, status, asaas_subscription_id, asaas_customer_id, current_period_start, current_period_end')
        .eq('asaas_subscription_id', subTargetId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      // Leitura falhou ≠ assinatura não existe: sem gate aqui, o entitlement
      // (o ACESSO do usuário) seria pulado em silêncio num hiccup do banco.
      if (subReadErr) return failEvent(eventRowId, 'asaas_webhook:sub-read', subReadErr)
      if (subRow?.user_id) {
        const { error: entErr } = await admin
          .from('user_entitlements')
          .upsert(
            {
              user_id: subRow.user_id,
              plan_id: subRow.plan_id,
              status: subStatus,
              provider: 'asaas',
              provider_customer_id: subRow.asaas_customer_id || null,
              provider_subscription_id: subRow.asaas_subscription_id || subTargetId,
              current_period_start: subRow.current_period_start || null,
              current_period_end: subRow.current_period_end || null,
              valid_from: subRow.current_period_start || new Date().toISOString(),
              valid_until: subRow.current_period_end || null,
              metadata: { updated_by: 'asaas_webhook', asaas_event_id: eventId || null, asaas_payment_id: paymentId || null },
            },
            // O índice único REAL é (user_id, provider, provider_subscription_id).
            // O alvo antigo 'provider,provider_subscription_id' não tem
            // constraint correspondente → 42P10 em toda execução (C3).
            { onConflict: 'user_id,provider,provider_subscription_id' },
          )
        if (entErr) return failEvent(eventRowId, 'asaas_webhook:entitlement', entErr)

        // Invalidate VIP caches so the user sees the new status immediately
        try {
          await Promise.all([
            cacheDelete(`vip:access:${subRow.user_id}`),
            cacheDelete(`dashboard:bootstrap:${subRow.user_id}`),
          ])
        } catch (cacheErr) { logWarn('asaas_webhook', 'Failed to invalidate VIP cache', cacheErr) }
      }
    }

    {
      const { error } = await admin.from('asaas_webhook_events').update({ processed_at: new Date().toISOString() }).eq('id', eventRowId)
      if (error) return failEvent(eventRowId, 'asaas_webhook:mark-processed', error)
    }
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    // processed_at fica NULL de propósito: o catch antigo marcava o evento
    // como processado ao registrar o erro — enterrando o evento (a reentrega
    // levava deduped e o pagamento se perdia).
    logError('asaas_webhook', e)
    if (eventRowId) {
      try {
        await admin
          .from('asaas_webhook_events')
          .update({ processing_error: (e as { message?: string })?.message ?? String(e) })
          .eq('id', eventRowId)
      } catch (logErr) { logWarn('asaas_webhook', 'Failed to record webhook error', logErr) }
    }
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 })
  }
}
