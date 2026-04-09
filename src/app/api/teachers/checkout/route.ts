import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { mercadopagoRequest } from '@/lib/mercadopago'
import { parseJsonBody } from '@/utils/zod'
import { getErrorMessage } from '@/utils/errorMessage'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { logError, logWarn } from '@/lib/logger'

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
  const origin = (req.headers.get('origin') || '').trim().replace(/\/$/, '')
  if (origin) return origin
  return 'http://localhost:3000'
}

const BodySchema = z.object({
  planId: z.string().min(1),
  cpfCnpj: z.preprocess(onlyDigits, z.string().refine((s) => s.length === 11 || s.length === 14, 'CPF deve ter 11 dígitos ou CNPJ 14')),
  mobilePhone: z.preprocess(onlyDigits, z.string().regex(/^\d{10,11}$/, 'Telefone deve ter 10 ou 11 dígitos')),
  name: z.preprocess((v) => (typeof v === 'string' ? v.trim() : ''), z.string().optional().default('')),
}).strip()

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const ip = getRequestIp(req)
    const rl = await checkRateLimitAsync(`teacher_checkout:${user.id}:${ip}`, 5, 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

    const parsedBody = await parseJsonBody(req, BodySchema)
    if (parsedBody.response) return parsedBody.response
    const { planId, cpfCnpj, mobilePhone: _mobilePhone, name: payerName } = parsedBody.data!

    const admin = createAdminClient()

    // Validate plan
    const { data: plan, error: planErr } = await admin
      .from('teacher_tiers')
      .select('tier_key, name, price_cents, currency, max_students')
      .eq('tier_key', planId)
      .eq('is_active', true)
      .maybeSingle()
    if (planErr || !plan) return NextResponse.json({ ok: false, error: 'plano_nao_encontrado' }, { status: 404 })
    if (Number(plan.price_cents) === 0) return NextResponse.json({ ok: false, error: 'plano_gratuito_nao_requer_checkout' }, { status: 400 })

    // Ensure teacher row exists
    const { data: teacher } = await admin
      .from('teachers')
      .select('id, plan_id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!teacher) return NextResponse.json({ ok: false, error: 'professor_nao_encontrado' }, { status: 404 })

    // Block downgrade to a lower-capacity plan if it would exceed new limit
    const newMax = Number(plan.max_students)
    if (newMax > 0) {
      const { data: countResult } = await admin.rpc('teacher_student_count', { p_teacher_user_id: user.id })
      if (Number(countResult ?? 0) > newMax) {
        return NextResponse.json({
          ok: false,
          error: `Você possui mais alunos do que o limite do plano ${plan.name}. Remova alunos antes de fazer downgrade.`,
        }, { status: 409 })
      }
    }

    const amount = Number((plan.price_cents ?? 0) / 100)
    const baseUrl = resolveBaseUrl(req)
    const idDigits = onlyDigits(cpfCnpj)
    const idType = idDigits.length === 14 ? 'CNPJ' : 'CPF'
    const pixKey = (process.env.MERCADOPAGO_PIX_KEY || '').trim() || undefined

    let payment: Record<string, unknown>
    try {
      const paymentBody: Record<string, unknown> = {
        transaction_amount: amount,
        description: `IronTracks — Plano ${plan.name}`,
        payment_method_id: 'pix',
        // scope:teacher_plan lets the webhook identify and process this payment
        external_reference: `teacher_plan:${user.id}:${planId}`,
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
      payment = await mercadopagoRequest<Record<string, unknown>>({
        method: 'POST',
        path: '/v1/payments',
        body: paymentBody,
      })
    } catch (mpErr: unknown) {
      logError('teacher_checkout', 'MercadoPago falhou', { userId: user.id, planId, error: getErrorMessage(mpErr) })
      return NextResponse.json({ ok: false, error: getErrorMessage(mpErr) || 'pagamento_falhou' }, { status: 502 })
    }

    const providerPaymentId = String(payment?.id ?? '').trim()
    const pointOfInteraction = (payment?.point_of_interaction ?? {}) as Record<string, unknown>
    const tx = (pointOfInteraction?.transaction_data ?? {}) as Record<string, unknown>
    const pixQrCode = tx?.qr_code_base64 ? String(tx.qr_code_base64) : null
    const pixPayload = tx?.qr_code ? String(tx.qr_code) : null
    const invoiceUrl = tx?.ticket_url ? String(tx.ticket_url) : null
    const dueDate = toDateOnly(payment?.date_of_expiration ? String(payment.date_of_expiration) : null)

    // Persist pending payment reference on teacher row
    try {
      await admin
        .from('teachers')
        .update({ plan_subscription_id: providerPaymentId })
        .eq('user_id', user.id)
    } catch (e) { logWarn('teacher_checkout', 'Could not update plan_subscription_id', e) }

    return NextResponse.json({
      ok: true,
      payment_id: providerPaymentId,
      pix_qr_code: pixQrCode,
      pix_payload: pixPayload,
      invoice_url: invoiceUrl,
      due_date: dueDate,
      amount,
      plan: { id: plan.tier_key, name: plan.name },
    })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}
