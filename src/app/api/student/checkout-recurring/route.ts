/**
 * POST /api/student/checkout-recurring
 *
 * Cria uma assinatura RECORRENTE por CARTÃO (MercadoPago Preapproval) do ALUNO pro plano do
 * professor. Retorna um `init_point` que o cliente abre (webview/nova aba) pro aluno cadastrar
 * o cartão no checkout hospedado do MP. Depois o MP cobra sozinho todo ciclo e dispara os
 * webhooks `preapproval.*`/`payment.*`, tratados no ramo `student_plan_recurring`.
 *
 * Molde: api/teachers/checkout-recurring (preapproval do professor→plataforma). Aqui o dono é
 * o ALUNO e o external_reference carrega professor+plano+aluno+assinatura.
 *
 * Coexiste com o PIX avulso (api/student/charge) — o aluno escolhe o método.
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { mercadopagoRequest } from '@/lib/mercadopago'
import { parseJsonBody } from '@/utils/zod'
import { getErrorMessage } from '@/utils/errorMessage'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { logError, logWarn } from '@/lib/logger'
import { env } from '@/utils/env'

export const dynamic = 'force-dynamic'

const resolveBaseUrl = (req: Request) => {
  const appBaseUrl = env.app.baseUrl.trim().replace(/\/$/, '')
  if (appBaseUrl) return appBaseUrl
  return (req.headers.get('origin') || 'http://localhost:3000').trim().replace(/\/$/, '')
}

/** billing_interval do plano → frequência do auto_recurring do MP. 'once' não é recorrente. */
const INTERVAL_TO_MP: Record<string, { frequency: number; frequency_type: 'months' }> = {
  monthly: { frequency: 1, frequency_type: 'months' },
  quarterly: { frequency: 3, frequency_type: 'months' },
  semiannual: { frequency: 6, frequency_type: 'months' },
  yearly: { frequency: 12, frequency_type: 'months' },
}

const BodySchema = z.object({
  subscription_id: z.string().uuid(),
}).strip()

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const ip = getRequestIp(req)
    const rl = await checkRateLimitAsync(`student_recur_checkout:${user.id}:${ip}`, 5, 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

    const parsed = await parseJsonBody(req, BodySchema)
    if (parsed.response) return parsed.response
    const { subscription_id } = parsed.data!

    const admin = createAdminClient()

    // Assinatura tem que ser DO ALUNO (student_user_id = user.id — anti-IDOR).
    const { data: sub } = await admin
      .from('student_subscriptions')
      .select('id, teacher_user_id, plan_id, status, recurring, preapproval_id, student_service_plans(id, name, price_cents, currency, billing_interval)')
      .eq('id', subscription_id)
      .eq('student_user_id', user.id)
      .maybeSingle()

    if (!sub) return NextResponse.json({ ok: false, error: 'assinatura_nao_encontrada' }, { status: 404 })
    if (!['pending', 'past_due'].includes(String(sub.status))) {
      return NextResponse.json({ ok: false, error: 'assinatura_ja_ativa' }, { status: 409 })
    }

    const plan = Array.isArray(sub.student_service_plans) ? sub.student_service_plans[0] : sub.student_service_plans
    if (!plan) return NextResponse.json({ ok: false, error: 'plano_nao_encontrado' }, { status: 404 })

    const amount = Number((plan as Record<string, unknown>).price_cents ?? 0) / 100
    if (amount <= 0) return NextResponse.json({ ok: false, error: 'plano_gratuito_nao_requer_pagamento' }, { status: 400 })

    const interval = String((plan as Record<string, unknown>).billing_interval || 'monthly').toLowerCase()
    const recurringCfg = INTERVAL_TO_MP[interval]
    if (!recurringCfg) {
      // Plano avulso ('once') não vira assinatura recorrente por cartão.
      return NextResponse.json({ ok: false, error: 'plano_nao_recorrente', message: 'Este plano é avulso — use o pagamento único por PIX.' }, { status: 400 })
    }

    // Cancela um preapproval anterior em andamento desta MESMA assinatura (evita cobrança
    // duplicada se o aluno tocar "assinar" duas vezes). Mesmo racional do molde do professor.
    const oldPreapproval = String(sub.preapproval_id || '').trim()
    if (oldPreapproval) {
      try {
        await mercadopagoRequest({ method: 'PUT', path: `/preapproval/${encodeURIComponent(oldPreapproval)}`, body: { status: 'cancelled' } })
      } catch (e) { logWarn('student_checkout_recurring', `Falha ao cancelar preapproval antigo ${oldPreapproval}`, e) }
    }

    const baseUrl = resolveBaseUrl(req)
    const currency = String((plan as Record<string, unknown>).currency || 'BRL')
    const externalRef = `student_plan_recurring:${sub.teacher_user_id}:${plan.id as string}:${user.id}:${subscription_id}`

    let preapproval: Record<string, unknown>
    try {
      preapproval = await mercadopagoRequest<Record<string, unknown>>({
        method: 'POST',
        path: '/preapproval',
        body: {
          reason: `IronTracks — ${String((plan as Record<string, unknown>).name || 'Plano')}`,
          external_reference: externalRef,
          payer_email: user.email || undefined,
          back_url: `${baseUrl}/auth/callback?from=student_checkout_recurring`,
          notification_url: `${baseUrl}/api/billing/webhooks/mercadopago`,
          status: 'pending',
          auto_recurring: {
            frequency: recurringCfg.frequency,
            frequency_type: recurringCfg.frequency_type,
            transaction_amount: amount,
            currency_id: currency,
          },
        },
      })
    } catch (mpErr: unknown) {
      logError('student_checkout_recurring', 'MercadoPago Preapproval falhou', { userId: user.id, subscriptionId: subscription_id, error: getErrorMessage(mpErr) })
      return NextResponse.json({ ok: false, error: 'pagamento_falhou' }, { status: 502 })
    }

    const preapprovalId = String(preapproval?.id ?? '').trim()
    const initPoint = String(preapproval?.init_point ?? '').trim()
    if (!preapprovalId || !initPoint) {
      return NextResponse.json({ ok: false, error: 'preapproval_invalido' }, { status: 502 })
    }

    // Marca a assinatura como recorrente por cartão (fica 'pending' até o webhook confirmar).
    await admin
      .from('student_subscriptions')
      .update({
        recurring: true,
        billing_method: 'card',
        preapproval_id: preapprovalId,
        provider: 'mercadopago',
        updated_at: new Date().toISOString(),
      })
      .eq('id', subscription_id)

    return NextResponse.json({ ok: true, preapproval_id: preapprovalId, init_point: initPoint, amount })
  } catch (e: unknown) {
    logError('student_checkout_recurring', e)
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}
