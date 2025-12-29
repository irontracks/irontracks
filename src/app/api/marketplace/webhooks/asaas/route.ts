import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'

export const dynamic = 'force-dynamic'

const mapSubscriptionStatusFromPayment = (status: string) => {
  const s = (status || '').toUpperCase()
  if (['RECEIVED', 'CONFIRMED'].includes(s)) return 'active'
  if (['OVERDUE'].includes(s)) return 'past_due'
  if (['CANCELED', 'CANCELLED', 'REFUNDED', 'CHARGEBACK', 'DELETED'].includes(s)) return 'cancelled'
  return 'pending'
}

export async function POST(req: Request) {
  const secret = (process.env.ASAAS_WEBHOOK_SECRET || '').trim()
  const provided = (req.headers.get('x-webhook-secret') || '').trim()
  if (secret && provided !== secret) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))

  const eventType = (body?.event || body?.type || body?.eventType || '') as string
  const eventId = (body?.id || body?.eventId || null) as string | null
  const payment = (body?.payment || body?.data?.payment || null) as any
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
      const code = (insertErr as any)?.code as string | undefined
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

    const updates: Record<string, any> = {
      status: paymentStatus || 'pending',
    }
    if (payment?.dueDate) updates.due_date = payment.dueDate
    if (payment?.invoiceUrl) updates.invoice_url = payment.invoiceUrl
    if (payment?.billingType) updates.billing_type = payment.billingType
    if (payment?.pixQrCode?.encodedImage) updates.pix_qr_code = payment.pixQrCode.encodedImage
    if (payment?.pixQrCode?.payload) updates.pix_payload = payment.pixQrCode.payload
    if (payment?.paymentDate) updates.paid_at = payment.paymentDate
    if (payment?.confirmedDate && !updates.paid_at) updates.paid_at = payment.confirmedDate

    const { data: payRow } = await admin
      .from('marketplace_payments')
      .update(updates)
      .eq('asaas_payment_id', paymentId)
      .select('id, subscription_id')
      .maybeSingle()

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

    await admin.from('asaas_webhook_events').update({ processed_at: new Date().toISOString() }).eq('id', inserted.id)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    try {
      await admin
        .from('asaas_webhook_events')
        .insert({
          asaas_event_id: eventId,
          event_type: eventType || null,
          payment_id: paymentId,
          payload: body,
          processing_error: e?.message ?? String(e),
          processed_at: new Date().toISOString(),
        })
    } catch {}

    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}
