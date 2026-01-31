import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { asaasRequest } from '@/lib/asaas'

export const dynamic = 'force-dynamic'

const addDays = (d: Date, days: number) => {
  const next = new Date(d)
  next.setDate(next.getDate() + days)
  return next
}

const toDateOnly = (d: Date) => d.toISOString().slice(0, 10)

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const planId = (body?.planId || '').trim() as string
    const billingType = ((body?.billingType || 'PIX') as string).trim().toUpperCase()
    const cpfCnpj = (body?.cpfCnpj || '').replace(/\D/g, '') as string
    const mobilePhone = (body?.mobilePhone || '').replace(/\D/g, '') as string
    const payerName = ((body?.name || '') as string).trim()

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
      .select('id, status, asaas_subscription_id')
      .eq('plan_id', planId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (existing && ['pending', 'active', 'past_due'].includes(existing.status || '')) {
      return NextResponse.json({ ok: false, error: 'already_subscribed' }, { status: 409 })
    }

    const { data: anyActive } = await admin
      .from('app_subscriptions')
      .select('id, status')
      .eq('user_id', user.id)
      .in('status', ['pending', 'active', 'past_due'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (anyActive?.id) {
      return NextResponse.json({ ok: false, error: 'already_has_active_subscription' }, { status: 409 })
    }

    const { data: mappedCustomer } = await admin
      .from('asaas_customers')
      .select('asaas_customer_id')
      .eq('user_id', user.id)
      .maybeSingle()

    let asaasCustomerId = (mappedCustomer?.asaas_customer_id || '') as string
    if (!asaasCustomerId) {
      const customer = await asaasRequest<{ id: string }>({
        method: 'POST',
        path: '/customers',
        body: {
          name: payerName || (user.email || 'Cliente'),
          cpfCnpj,
          email: user.email || undefined,
          mobilePhone,
        },
      })
      asaasCustomerId = customer.id
      await admin.from('asaas_customers').upsert({ user_id: user.id, asaas_customer_id: asaasCustomerId })
    }

    const cycle = plan.interval === 'year' ? 'YEARLY' : 'MONTHLY'
    const value = Number((plan.price_cents || 0) / 100)
    const nextDueDate = toDateOnly(addDays(new Date(), 1))

    const subscription = await asaasRequest<{ id: string }>({
      method: 'POST',
      path: '/subscriptions',
      body: {
        customer: asaasCustomerId,
        billingType,
        nextDueDate,
        value,
        cycle,
        description: plan.name,
      },
    })

    const subscriptionId = subscription.id

    const { data: subRow, error: subErr } = await admin
      .from('app_subscriptions')
      .insert({
        plan_id: plan.id,
        user_id: user.id,
        status: 'pending',
        provider: 'asaas',
        provider_subscription_id: subscriptionId,
        provider_customer_id: asaasCustomerId,
        asaas_subscription_id: subscriptionId,
        asaas_customer_id: asaasCustomerId,
        metadata: { checkout: { billingType } },
      })
      .select('id, status, asaas_subscription_id')
      .single()

    if (subErr || !subRow) return NextResponse.json({ ok: false, error: subErr?.message || 'failed_to_store_subscription' }, { status: 400 })

    const payments = await asaasRequest<{ data?: any[] }>({
      method: 'GET',
      path: `/subscriptions/${encodeURIComponent(subscriptionId)}/payments`,
    })
    const first = Array.isArray(payments?.data) && payments.data.length ? payments.data[0] : null
    if (!first?.id) return NextResponse.json({ ok: true, subscription: subRow, payment: null })

    const amountCents = Number.isFinite(plan.price_cents) ? Number(plan.price_cents) : 0

    const { data: payRow } = await admin
      .from('app_payments')
      .insert({
        subscription_id: subRow.id,
        plan_id: plan.id,
        user_id: user.id,
        amount_cents: amountCents,
        currency: plan.currency || 'BRL',
        billing_type: billingType,
        status: first?.status || 'pending',
        due_date: first?.dueDate || null,
        paid_at: first?.paymentDate || null,
        provider: 'asaas',
        provider_payment_id: first.id,
        asaas_payment_id: first.id,
        invoice_url: first?.invoiceUrl || null,
        pix_qr_code: first?.pixQrCode?.encodedImage || null,
        pix_payload: first?.pixQrCode?.payload || null,
        raw: first || {},
      })
      .select('id, status, due_date, asaas_payment_id, invoice_url, pix_qr_code, pix_payload')
      .single()

    return NextResponse.json({ ok: true, subscription: subRow, payment: payRow || null })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}
