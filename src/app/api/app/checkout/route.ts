import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { asaasRequest } from '@/lib/asaas'
import { parseJsonBody } from '@/utils/zod'

export const dynamic = 'force-dynamic'

const addDays = (d: Date, days: number) => {
  const next = new Date(d)
  next.setDate(next.getDate() + days)
  return next
}

const toDateOnly = (d: Date) => d.toISOString().slice(0, 10)

const BodySchema = z
  .object({
    planId: z.string().min(1),
    billingType: z.preprocess((v) => (typeof v === 'string' ? v.trim().toUpperCase() : 'PIX'), z.string().default('PIX')),
    cpfCnpj: z.preprocess((v) => String(v ?? '').replace(/\D/g, ''), z.string().min(1)),
    mobilePhone: z.preprocess((v) => String(v ?? '').replace(/\D/g, ''), z.string().min(1)),
    name: z.preprocess((v) => (typeof v === 'string' ? v.trim() : ''), z.string().optional().default('')),
  })
  .passthrough()

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
      .select('id, status, asaas_subscription_id, provider, provider_subscription_id, provider_customer_id, created_at')
      .eq('plan_id', planId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (existing && String(existing.status || '') === 'pending') {
      const subId = String(existing?.asaas_subscription_id || existing?.provider_subscription_id || '').trim()
      if (subId) {
        const payments = await asaasRequest<{ data?: any[] }>({
          method: 'GET',
          path: `/subscriptions/${encodeURIComponent(subId)}/payments`,
        })
        const first = Array.isArray(payments?.data) && payments.data.length ? payments.data[0] : null
        const amountCents = Number.isFinite(plan.price_cents) ? Number(plan.price_cents) : 0
        const payRow = first?.id
          ? {
              id: '',
              status: first?.status || 'pending',
              due_date: first?.dueDate || null,
              asaas_payment_id: first.id,
              invoice_url: first?.invoiceUrl || null,
              pix_qr_code: first?.pixQrCode?.encodedImage || null,
              pix_payload: first?.pixQrCode?.payload || null,
            }
          : null
        return NextResponse.json({
          ok: true,
          subscription: { id: existing.id, status: existing.status, asaas_subscription_id: subId },
          payment: payRow,
          resumed: true,
          amount_cents: amountCents,
        })
      }
      await admin.from('app_subscriptions').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', existing.id)
    } else if (existing && ['active', 'past_due'].includes(existing.status || '')) {
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

    if (subErr || !subRow) {
      const msg = String(subErr?.message || '')
      if (msg.toLowerCase().includes('column') && msg.toLowerCase().includes('provider')) {
        return NextResponse.json({ ok: false, error: 'db_migration_required' }, { status: 500 })
      }
      return NextResponse.json({ ok: false, error: subErr?.message || 'failed_to_store_subscription' }, { status: 400 })
    }

    const payments = await asaasRequest<{ data?: any[] }>({
      method: 'GET',
      path: `/subscriptions/${encodeURIComponent(subscriptionId)}/payments`,
    })
    const first = Array.isArray(payments?.data) && payments.data.length ? payments.data[0] : null
    if (!first?.id) return NextResponse.json({ ok: true, subscription: subRow, payment: null })

    const amountCents = Number.isFinite(plan.price_cents) ? Number(plan.price_cents) : 0

    const { data: payRow, error: payErr } = await admin
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

    if (payErr) {
      const msg = String(payErr?.message || '')
      if (msg.toLowerCase().includes('column') && msg.toLowerCase().includes('provider')) {
        return NextResponse.json({ ok: false, error: 'db_migration_required' }, { status: 500 })
      }
      return NextResponse.json({ ok: false, error: payErr.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true, subscription: subRow, payment: payRow || null })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}
