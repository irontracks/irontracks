import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { mercadopagoRequest } from '@/lib/mercadopago'
import { parseJsonBody } from '@/utils/zod'
import { getErrorMessage } from '@/utils/errorMessage'

export const dynamic = 'force-dynamic'

const resolveBaseUrl = (req: Request) => {
  const env = (process.env.APP_BASE_URL || '').trim().replace(/\/$/, '')
  if (env) return env
  const origin = (req.headers.get('origin') || '').trim().replace(/\/$/, '')
  if (origin) return origin
  return 'http://localhost:3000'
}

const toDateOnly = (iso: string | null) => {
  try {
    if (!iso) return null
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return null
    return d.toISOString().slice(0, 10)
  } catch {
    return null
  }
}

const onlyDigits = (v: unknown) => String(v ?? '').replace(/\D/g, '')

const BodySchema = z
  .object({
    planId: z.string().min(1),
    billingType: z.preprocess((v) => (typeof v === 'string' ? v.trim().toUpperCase() : 'PIX'), z.string().default('PIX')),
    cpfCnpj: z.preprocess((v) => onlyDigits(v), z.string().min(1)),
    mobilePhone: z.preprocess((v) => onlyDigits(v), z.string().min(1)),
    name: z.preprocess((v) => (typeof v === 'string' ? v.trim() : ''), z.string().optional().default('')),
  })
  .strip()

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const parsedBody = await parseJsonBody(req, BodySchema)
    if (parsedBody.response) return parsedBody.response
    const { planId, billingType, cpfCnpj, mobilePhone, name: payerName } = parsedBody.data!

    if (!planId) return NextResponse.json({ ok: false, error: 'missing_plan' }, { status: 400 })
    if (!['PIX'].includes(billingType)) return NextResponse.json({ ok: false, error: 'unsupported_billing_type' }, { status: 400 })
    if (!cpfCnpj) return NextResponse.json({ ok: false, error: 'cpf_cnpj_required' }, { status: 400 })
    if (!mobilePhone) return NextResponse.json({ ok: false, error: 'mobile_phone_required' }, { status: 400 })

    const admin = createAdminClient()

    const { data: plan, error: planErr } = await admin
      .from('app_plans')
      .select('id, name, description, price_cents, currency, interval, status, features')
      .eq('id', planId)
      .maybeSingle()
    if (planErr) return NextResponse.json({ ok: false, error: planErr.message }, { status: 400 })
    if (!plan || plan.status !== 'active') return NextResponse.json({ ok: false, error: 'plan_not_found' }, { status: 404 })

    const { data: existing } = await admin
      .from('app_subscriptions')
      .select('id, status, provider, plan_id, metadata, created_at')
      .eq('plan_id', planId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (existing && String(existing.status || '') === 'pending') {
      const ageMs = Date.now() - new Date(String(existing.created_at || '')).getTime()
      const meta = existing?.metadata && typeof existing.metadata === 'object' ? (existing.metadata as Record<string, unknown>) : {} as Record<string, unknown>
      const mp = meta?.mercadopago && typeof meta.mercadopago === 'object' ? (meta.mercadopago as Record<string, unknown>) : {} as Record<string, unknown>
      const payId = String(mp?.payment_id || '').trim()
      if (String(existing.provider || '') === 'mercadopago' && payId) {
        const { data: pay } = await admin
          .from('app_payments')
          .select('id, status, due_date, provider_payment_id, invoice_url, pix_qr_code, pix_payload')
          .eq('subscription_id', existing.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        return NextResponse.json({ ok: true, subscription: { id: existing.id, status: existing.status }, payment: pay || null, resumed: true })
      }
      if (Number.isFinite(ageMs) && ageMs > 10 * 60 * 1000) {
        await admin.from('app_subscriptions').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', existing.id)
      } else {
        return NextResponse.json({ ok: false, error: 'pending_subscription_exists' }, { status: 409 })
      }
    } else if (existing && ['active', 'past_due'].includes(String(existing.status || ''))) {
      return NextResponse.json({ ok: false, error: 'already_subscribed' }, { status: 409 })
    }

    const { data: anyActive } = await admin
      .from('app_subscriptions')
      .select('id, status, created_at')
      .eq('user_id', user.id)
      .in('status', ['pending', 'active', 'past_due'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (anyActive?.id && String(anyActive.status || '') === 'pending') {
      const ageMs = Date.now() - new Date(String(anyActive.created_at || '')).getTime()
      if (Number.isFinite(ageMs) && ageMs > 10 * 60 * 1000) {
        await admin.from('app_subscriptions').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', anyActive.id)
      } else {
        return NextResponse.json({ ok: false, error: 'pending_subscription_exists' }, { status: 409 })
      }
    }
    if (anyActive?.id && ['active', 'past_due'].includes(String(anyActive.status || ''))) {
      return NextResponse.json({ ok: false, error: 'already_has_active_subscription' }, { status: 409 })
    }

    const amount = Number((plan.price_cents || 0) / 100)
    const currencyId = String(plan.currency || 'BRL').trim().toUpperCase()

    const { data: subRow, error: subErr } = await admin
      .from('app_subscriptions')
      .insert({
        plan_id: plan.id,
        user_id: user.id,
        status: 'pending',
        provider: 'mercadopago',
        metadata: { checkout: { billingType: 'PIX' } },
      })
      .select('id, status')
      .single()
    if (subErr || !subRow) {
      const msg = String(subErr?.message || '')
      if (msg.toLowerCase().includes('column') && msg.toLowerCase().includes('provider')) {
        return NextResponse.json({ ok: false, error: 'db_migration_required' }, { status: 500 })
      }
      return NextResponse.json({ ok: false, error: subErr?.message || 'failed_to_store_subscription' }, { status: 400 })
    }

    const baseUrl = resolveBaseUrl(req)
    const idDigits = onlyDigits(cpfCnpj)
    const idType = idDigits.length === 14 ? 'CNPJ' : 'CPF'
    const payment = await mercadopagoRequest<Record<string, unknown>>({
      method: 'POST',
      path: '/v1/payments',
      body: {
        transaction_amount: amount,
        description: plan.name,
        payment_method_id: 'pix',
        external_reference: `vip:${user.id}:${plan.id}`,
        notification_url: `${baseUrl}/api/billing/webhooks/mercadopago`,
        payer: {
          email: user.email || undefined,
          first_name: payerName || undefined,
          identification: idDigits ? { type: idType, number: idDigits } : undefined,
        },
      },
    })

    const providerPaymentId = String(payment?.id || '').trim()
    const pointOfInteraction = (payment?.point_of_interaction || {}) as Record<string, unknown>
    const tx = (pointOfInteraction?.transaction_data || {}) as Record<string, unknown>
    const pixQrCode = tx?.qr_code_base64 ? String(tx.qr_code_base64) : null
    const pixPayload = tx?.qr_code ? String(tx.qr_code) : null
    const invoiceUrl = tx?.ticket_url ? String(tx.ticket_url) : null
    const dueIso = payment?.date_of_expiration ? String(payment.date_of_expiration) : null
    const dueDate = toDateOnly(dueIso)

    const amountCents = Number.isFinite(plan.price_cents) ? Number(plan.price_cents) : 0
    const { data: payRow, error: payErr } = await admin
      .from('app_payments')
      .insert({
        subscription_id: subRow.id,
        plan_id: plan.id,
        user_id: user.id,
        amount_cents: amountCents,
        currency: currencyId,
        billing_type: 'PIX',
        status: String(payment?.status || 'pending'),
        due_date: dueDate,
        paid_at: payment?.date_approved || null,
        provider: 'mercadopago',
        provider_payment_id: providerPaymentId,
        invoice_url: invoiceUrl,
        pix_qr_code: pixQrCode,
        pix_payload: pixPayload,
        raw: payment || {},
      })
      .select('id, status, due_date, provider_payment_id, invoice_url, pix_qr_code, pix_payload')
      .single()

    if (payErr) {
      const msg = String(payErr?.message || '')
      if (msg.toLowerCase().includes('column') && msg.toLowerCase().includes('provider')) {
        return NextResponse.json({ ok: false, error: 'db_migration_required' }, { status: 500 })
      }
      return NextResponse.json({ ok: false, error: payErr.message }, { status: 400 })
    }

    await admin
      .from('app_subscriptions')
      .update({
        metadata: { checkout: { billingType: 'PIX' }, mercadopago: { payment_id: providerPaymentId, invoice_url: invoiceUrl } },
        updated_at: new Date().toISOString(),
      })
      .eq('id', subRow.id)

    return NextResponse.json({ ok: true, subscription: subRow, payment: payRow || null })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}
