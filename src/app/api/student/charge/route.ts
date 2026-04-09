import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { mercadopagoRequest } from '@/lib/mercadopago'
import { parseJsonBody } from '@/utils/zod'
import { getErrorMessage } from '@/utils/errorMessage'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { logError } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const onlyDigits = (v: unknown) => String(v ?? '').replace(/\D/g, '')

const toDateOnly = (iso: string | null) => {
  try {
    if (!iso) return null
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return null
    return d.toISOString().slice(0, 10)
  } catch { return null }
}

const resolveBaseUrl = (req: Request) => {
  const env = (process.env.APP_BASE_URL || '').trim().replace(/\/$/, '')
  if (env) return env
  return (req.headers.get('origin') || 'http://localhost:3000').trim().replace(/\/$/, '')
}

const BodySchema = z.object({
  subscription_id: z.string().uuid(),
  cpfCnpj: z.preprocess(onlyDigits, z.string().refine(s => s.length === 11 || s.length === 14, 'CPF deve ter 11 dígitos ou CNPJ 14')),
  mobilePhone: z.preprocess(onlyDigits, z.string().regex(/^\d{10,11}$/, 'Telefone deve ter 10 ou 11 dígitos')),
  name: z.preprocess(v => (typeof v === 'string' ? v.trim() : ''), z.string().optional().default('')),
}).strip()

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const ip = getRequestIp(req)
    const rl = await checkRateLimitAsync(`student_charge:${user.id}:${ip}`, 5, 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

    const parsed = await parseJsonBody(req, BodySchema)
    if (parsed.response) return parsed.response
    const { subscription_id, cpfCnpj, name: payerName } = parsed.data!

    const admin = createAdminClient()

    // Load subscription + plan
    const { data: sub } = await admin
      .from('student_subscriptions')
      .select('id, teacher_user_id, plan_id, status, student_service_plans(id, name, price_cents, duration_days)')
      .eq('id', subscription_id)
      .eq('student_user_id', user.id)
      .maybeSingle()

    if (!sub) return NextResponse.json({ ok: false, error: 'assinatura_nao_encontrada' }, { status: 404 })
    if (!['pending', 'past_due'].includes(sub.status)) {
      return NextResponse.json({ ok: false, error: 'assinatura_ja_ativa' }, { status: 409 })
    }

    const plan = Array.isArray(sub.student_service_plans) ? sub.student_service_plans[0] : sub.student_service_plans
    if (!plan) return NextResponse.json({ ok: false, error: 'plano_nao_encontrado' }, { status: 404 })

    // Check for existing pending charge
    const { data: existingCharge } = await admin
      .from('student_charges')
      .select('id, status, pix_qr_code, pix_payload, invoice_url, due_date')
      .eq('subscription_id', subscription_id)
      .eq('student_user_id', user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existingCharge) {
      return NextResponse.json({ ok: true, charge: existingCharge, resumed: true })
    }

    const amount = Number((plan as Record<string, unknown>).price_cents ?? 0) / 100
    if (amount <= 0) return NextResponse.json({ ok: false, error: 'plano_gratuito_nao_requer_pagamento' }, { status: 400 })

    const idDigits = onlyDigits(cpfCnpj)
    const idType = idDigits.length === 14 ? 'CNPJ' : 'CPF'
    const pixKey = (process.env.MERCADOPAGO_PIX_KEY || '').trim() || undefined
    const baseUrl = resolveBaseUrl(req)

    let payment: Record<string, unknown>
    try {
      const paymentBody: Record<string, unknown> = {
        transaction_amount: amount,
        description: `${String((plan as Record<string, unknown>).name ?? 'Plano')} — Mensalidade`,
        payment_method_id: 'pix',
        external_reference: `student_plan:${sub.teacher_user_id}:${plan.id as string}:${user.id}:${subscription_id}`,
        notification_url: `${baseUrl}/api/billing/webhooks/mercadopago`,
        payer: {
          email: user.email || undefined,
          first_name: payerName || undefined,
          identification: idDigits ? { type: idType, number: idDigits } : undefined,
        },
      }
      if (pixKey) {
        paymentBody.additional_info = { pix_key: pixKey }
        paymentBody.point_of_interaction = {
          type: 'PIX_TRANSFER',
          transaction_data: { bank_info: { pix: { key: pixKey, key_type: 'EVP' } } },
        }
      }
      payment = await mercadopagoRequest<Record<string, unknown>>({ method: 'POST', path: '/v1/payments', body: paymentBody })
    } catch (mpErr: unknown) {
      logError('student_charge', 'MercadoPago falhou', { userId: user.id, subscriptionId: subscription_id, error: getErrorMessage(mpErr) })
      return NextResponse.json({ ok: false, error: getErrorMessage(mpErr) || 'pagamento_falhou' }, { status: 502 })
    }

    const poi = (payment?.point_of_interaction ?? {}) as Record<string, unknown>
    const tx = (poi?.transaction_data ?? {}) as Record<string, unknown>

    const { data: charge, error: chargeErr } = await admin
      .from('student_charges')
      .insert({
        subscription_id,
        teacher_user_id: sub.teacher_user_id,
        student_user_id: user.id,
        plan_id: plan.id as string,
        amount_cents: Math.round(amount * 100),
        status: String(payment?.status ?? 'pending'),
        provider: 'mercadopago',
        provider_payment_id: String(payment?.id ?? '').trim() || null,
        pix_qr_code: tx?.qr_code_base64 ? String(tx.qr_code_base64) : null,
        pix_payload: tx?.qr_code ? String(tx.qr_code) : null,
        invoice_url: tx?.ticket_url ? String(tx.ticket_url) : null,
        due_date: toDateOnly(payment?.date_of_expiration ? String(payment.date_of_expiration) : null),
        raw: payment,
      })
      .select('id, status, amount_cents, pix_qr_code, pix_payload, invoice_url, due_date')
      .single()

    if (chargeErr) return NextResponse.json({ ok: false, error: chargeErr.message }, { status: 400 })
    return NextResponse.json({ ok: true, charge })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}
