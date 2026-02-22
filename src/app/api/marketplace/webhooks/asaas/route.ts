import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/utils/supabase/admin'
import { parseJsonBody } from '@/utils/zod'

export const dynamic = 'force-dynamic'

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
  const secret = (process.env.ASAAS_WEBHOOK_SECRET || '').trim()
  const provided = (req.headers.get('x-webhook-secret') || '').trim()
  if (!secret) {
    return NextResponse.json({ ok: false, error: 'webhook_not_configured' }, { status: 500 })
  }
  if (provided !== secret) {
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

  const admin = createAdminClient()

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
        return NextResponse.json({ ok: true, deduped: true })
      }
      return NextResponse.json({ ok: false, error: msg }, { status: 400 })
    }

    if (!paymentId) {
      await admin.from('asaas_webhook_events').update({ processed_at: new Date().toISOString() }).eq('id', inserted.id)
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

    const { data: payRow } = await admin
      .from('marketplace_payments')
      .update(updates)
      .eq('asaas_payment_id', paymentId)
      .select('id, subscription_id')
      .maybeSingle()

    const { data: appPayRow } = payRow
      ? { data: null as Record<string, unknown> | null }
      : await admin
          .from('app_payments')
          .update(updates)
          .eq('asaas_payment_id', paymentId)
          .select('id, subscription_id')
          .maybeSingle()
    if (!payRow?.id && !appPayRow?.id) {
      await admin.from('app_payments').update(updates).eq('provider', 'asaas').eq('provider_payment_id', paymentId)
    }

    const subStatus = mapSubscriptionStatusFromPayment(paymentStatus)
    const subTargetId = subscriptionId
    if (subTargetId) {
      await admin
        .from('marketplace_subscriptions')
        .update({ status: subStatus, updated_at: new Date().toISOString() })
        .eq('asaas_subscription_id', subTargetId)
    } else if (payRow?.subscription_id) {
      await admin
        .from('marketplace_subscriptions')
        .update({ status: subStatus, updated_at: new Date().toISOString() })
        .eq('id', payRow.subscription_id)
    }

    if (subTargetId) {
      await admin
        .from('app_subscriptions')
        .update({ status: subStatus, updated_at: new Date().toISOString() })
        .eq('asaas_subscription_id', subTargetId)
      await admin
        .from('app_subscriptions')
        .update({ status: subStatus, updated_at: new Date().toISOString() })
        .eq('provider', 'asaas')
        .eq('provider_subscription_id', subTargetId)
    } else if ((appPayRow as Record<string, unknown>)?.subscription_id) {
      await admin
        .from('app_subscriptions')
        .update({ status: subStatus, updated_at: new Date().toISOString() })
        .eq('id', (appPayRow as Record<string, unknown>)?.subscription_id)
    }

    if (subTargetId) {
      try {
        const { data: subRow } = await admin
          .from('app_subscriptions')
          .select('user_id, plan_id, status, asaas_subscription_id, asaas_customer_id, current_period_start, current_period_end')
          .eq('asaas_subscription_id', subTargetId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (subRow?.user_id) {
          await admin
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
              { onConflict: 'provider,provider_subscription_id' },
            )
        }
      } catch {}
    }

    await admin.from('asaas_webhook_events').update({ processed_at: new Date().toISOString() }).eq('id', inserted.id)
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    try {
      await admin
        .from('asaas_webhook_events')
        .insert({
          asaas_event_id: eventId,
          event_type: eventType || null,
          payment_id: paymentId,
          payload: body,
          processing_error: (e as { message?: string })?.message ?? String(e),
          processed_at: new Date().toISOString(),
        })
    } catch {}

    return NextResponse.json({ ok: false, error: (e as { message?: string })?.message ?? String(e) }, { status: 500 })
  }
}
