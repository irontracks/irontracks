import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { z } from 'zod'
import { createAdminClient } from '@/utils/supabase/admin'
import { mercadopagoRequest } from '@/lib/mercadopago'
import { parseJsonBody } from '@/utils/zod'

export const dynamic = 'force-dynamic'

const parseSignature = (raw: string) => {
  const parts = raw.split(',').map((p) => p.trim()).filter(Boolean)
  let ts = ''
  let v1 = ''
  for (const part of parts) {
    const [k, v] = part.split('=').map((s) => (s || '').trim())
    if (k === 'ts') ts = v || ''
    if (k === 'v1') v1 = v || ''
  }
  return { ts, v1 }
}

const verifyWebhook = (opts: { secret: string; xSignature: string; xRequestId: string; dataId: string }) => {
  const { ts, v1 } = parseSignature(opts.xSignature)
  if (!ts || !v1) return false
  const manifest = `id:${opts.dataId};request-id:${opts.xRequestId};ts:${ts};`
  const hashed = crypto.createHmac('sha256', opts.secret).update(manifest).digest('hex')
  return hashed.toLowerCase() === v1.toLowerCase()
}

const mapSubscriptionStatus = (status: string) => {
  const s = (status || '').toLowerCase()
  if (['authorized', 'approved'].includes(s)) return 'active'
  if (['paused'].includes(s)) return 'past_due'
  if (['cancelled', 'canceled'].includes(s)) return 'cancelled'
  return 'pending'
}

const addInterval = (start: Date, interval: string) => {
  const d = new Date(start)
  if (String(interval || '').toLowerCase() === 'year') {
    d.setMonth(d.getMonth() + 12)
    return d
  }
  d.setMonth(d.getMonth() + 1)
  return d
}

const BodySchema = z
  .object({
    type: z.string().optional(),
    topic: z.string().optional(),
    action: z.string().optional(),
    data: z
      .object({
        id: z.union([z.string(), z.number()]).optional(),
      })
      .optional(),
  })
  .passthrough()

export async function POST(req: Request) {
  const secret = (process.env.MERCADOPAGO_WEBHOOK_SECRET || '').trim()
  if (!secret) {
    return NextResponse.json({ ok: false, error: 'webhook_not_configured' }, { status: 500 })
  }

  const url = new URL(req.url)
  const xSignature = (req.headers.get('x-signature') || '').trim()
  const xRequestId = (req.headers.get('x-request-id') || '').trim()

  const parsedBody = await parseJsonBody(req, BodySchema)
  if (parsedBody.response) return parsedBody.response
  const body = parsedBody.data!
  const dataId = String(body?.data?.id || url.searchParams.get('data.id') || url.searchParams.get('id') || '').trim()
  if (!xSignature || !xRequestId || !dataId) {
    return NextResponse.json({ ok: false, error: 'invalid_webhook' }, { status: 400 })
  }

  if (!verifyWebhook({ secret, xSignature, xRequestId, dataId })) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const eventType = String(body?.type || body?.topic || '').trim().toLowerCase()
  const action = String(body?.action || '').trim().toLowerCase()

  const admin = createAdminClient()

  try {
    try {
      await admin
        .from('mercadopago_webhook_events')
        .insert({
          request_id: xRequestId,
          event_type: eventType || null,
          action: action || null,
          data_id: dataId,
          payload: body,
        })
    } catch {}

    if (eventType === 'preapproval' || action.startsWith('preapproval.')) {
      const preapproval = await mercadopagoRequest<Record<string, unknown>>({
        method: 'GET',
        path: `/preapproval/${encodeURIComponent(dataId)}`,
      })

      const status = mapSubscriptionStatus(String(preapproval?.status || ''))
      const providerSubscriptionId = String(preapproval?.id || dataId).trim()

      const meta = preapproval && typeof preapproval === 'object' ? { mercadopago: { raw: preapproval } } : { mercadopago: {} }

      await admin
        .from('app_subscriptions')
        .update({ status, updated_at: new Date().toISOString(), metadata: meta })
        .eq('provider', 'mercadopago')
        .eq('provider_subscription_id', providerSubscriptionId)

      if (status === 'active') {
        const { data: sub } = await admin
          .from('app_subscriptions')
          .select('id, user_id, plan_id')
          .eq('provider', 'mercadopago')
          .eq('provider_subscription_id', providerSubscriptionId)
          .maybeSingle()
        if (sub?.user_id) {
          const { data: plan } = await admin.from('app_plans').select('id, interval').eq('id', sub.plan_id).maybeSingle()
          const now = new Date()
          const end = plan?.interval ? addInterval(now, String(plan.interval)) : null
          await admin
            .from('user_entitlements')
            .upsert(
              {
                user_id: sub.user_id,
                plan_id: sub.plan_id,
                status: 'active',
                provider: 'mercadopago',
                provider_subscription_id: providerSubscriptionId,
                current_period_start: now.toISOString(),
                current_period_end: end ? end.toISOString() : null,
                valid_from: now.toISOString(),
                valid_until: end ? end.toISOString() : null,
                metadata: { mercadopago: { kind: 'preapproval', subscription_id: providerSubscriptionId, raw: preapproval } },
              },
              { onConflict: 'provider,provider_subscription_id' },
            )
          await admin
            .from('app_subscriptions')
            .update({
              current_period_start: now.toISOString(),
              current_period_end: end ? end.toISOString() : null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', sub.id)
        }
      }

      return NextResponse.json({ ok: true })
    }

    if (eventType === 'payment' || action.startsWith('payment.')) {
      const payment = await mercadopagoRequest<Record<string, unknown>>({
        method: 'GET',
        path: `/v1/payments/${encodeURIComponent(dataId)}`,
      })

      const externalRef = String(payment?.external_reference || '').trim()
      const [scope, userId, planId] = externalRef.split(':')
      const amount = Number(payment?.transaction_amount || 0)
      const amountCents = Math.round((Number.isFinite(amount) ? amount : 0) * 100)
      const currency = String(payment?.currency_id || 'BRL').trim().toUpperCase()
      const status = String(payment?.status || 'pending').trim()

      const meta = payment && typeof payment === 'object' ? { mercadopago: { raw: payment } } : { mercadopago: {} }

      if (scope === 'vip' && userId) {
        const now = new Date()
        const { data: plan } = planId ? await admin.from('app_plans').select('id, interval').eq('id', planId).maybeSingle() : { data: null }
        const end = plan?.interval ? addInterval(now, String(plan.interval)) : null

        const { data: activeSub } = await admin
          .from('app_subscriptions')
          .select('id, status')
          .eq('provider', 'mercadopago')
          .eq('user_id', userId)
          .in('status', ['pending', 'active', 'past_due'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        await admin
          .from('app_payments')
          .upsert(
            {
              subscription_id: activeSub?.id ?? null,
              user_id: userId,
              plan_id: planId || null,
              amount_cents: amountCents,
              currency,
              status,
              provider: 'mercadopago',
              provider_payment_id: dataId,
              raw: meta,
            },
            { onConflict: 'provider,provider_payment_id' },
          )

        if (status.toLowerCase() === 'approved') {
          const entSubId = activeSub?.id ? String(activeSub.id) : ''
          await admin
            .from('app_subscriptions')
            .update({
              status: 'active',
              current_period_start: now.toISOString(),
              current_period_end: end ? end.toISOString() : null,
              updated_at: new Date().toISOString(),
            })
            .eq('provider', 'mercadopago')
            .eq('user_id', userId)
            .in('status', ['pending', 'past_due'])

          await admin
            .from('user_entitlements')
            .upsert(
              {
                user_id: userId,
                plan_id: planId || null,
                status: 'active',
                provider: 'mercadopago',
                provider_subscription_id: `payment:${dataId}`,
                current_period_start: now.toISOString(),
                current_period_end: end ? end.toISOString() : null,
                valid_from: now.toISOString(),
                valid_until: end ? end.toISOString() : null,
                metadata: { mercadopago: { kind: 'payment', payment_id: dataId, subscription_id: entSubId || null, raw: payment } },
              },
              { onConflict: 'provider,provider_subscription_id' },
            )
        }
      }

      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ ok: true, ignored: true })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: (e as { message?: string })?.message ?? String(e) }, { status: 500 })
  }
}
