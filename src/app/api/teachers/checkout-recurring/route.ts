/**
 * POST /api/teachers/checkout-recurring
 *
 * Creates a MercadoPago **Preapproval** (recurring subscription) for the
 * teacher's chosen tier. Returns an `init_point` URL that the client opens
 * (in a webview / new tab) so the teacher picks card / PIX inside MP's hosted
 * checkout. After they authorise, MP fires `preapproval.created` /
 * `preapproval.updated` webhooks which the existing handler processes.
 *
 * Difference from `/api/teachers/checkout` (PIX one-shot):
 *   • That endpoint generates a single PIX payment that grants 1 month manually.
 *   • This endpoint generates a recurring subscription that auto-charges every
 *     month — no churn-by-forgetting risk.
 *
 * Both flows coexist; the user chooses which they prefer in the Upgrade modal.
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
  const origin = (req.headers.get('origin') || '').trim().replace(/\/$/, '')
  if (origin) return origin
  return 'http://localhost:3000'
}

const BodySchema = z.object({
  planId: z.string().min(1),
}).strip()

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const ip = getRequestIp(req)
    const rl = await checkRateLimitAsync(`teacher_recur_checkout:${user.id}:${ip}`, 5, 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

    const parsedBody = await parseJsonBody(req, BodySchema)
    if (parsedBody.response) return parsedBody.response
    const { planId } = parsedBody.data!

    const admin = createAdminClient()

    // Validate plan exists and is paid
    const { data: plan, error: planErr } = await admin
      .from('teacher_tiers')
      .select('tier_key, name, price_cents, currency, max_students')
      .eq('tier_key', planId)
      .eq('is_active', true)
      .maybeSingle()
    if (planErr || !plan) return NextResponse.json({ ok: false, error: 'plano_nao_encontrado' }, { status: 404 })
    if (Number(plan.price_cents) === 0) {
      return NextResponse.json({ ok: false, error: 'plano_gratuito_nao_requer_assinatura' }, { status: 400 })
    }

    // Ensure teacher row exists
    const { data: teacher } = await admin
      .from('teachers')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!teacher) return NextResponse.json({ ok: false, error: 'professor_nao_encontrado' }, { status: 404 })

    // Block downgrade that would exceed limit
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

    // ── Cancel any in-flight preapproval before creating a new one ────────
    // Avoids leaving the teacher with two recurring charges if they tap
    // "Subscribe" twice or upgrade/downgrade quickly.
    try {
      const { data: oldSubs } = await admin
        .from('app_subscriptions')
        .select('id, provider_subscription_id')
        .eq('user_id', user.id)
        .eq('provider', 'mercadopago')
        .filter('metadata->>scope', 'eq', 'teacher_plan_recurring')
        .in('status', ['pending', 'active', 'past_due'])
      for (const sub of oldSubs ?? []) {
        const oldId = String(sub.provider_subscription_id || '').trim()
        if (oldId) {
          try {
            await mercadopagoRequest({
              method: 'PUT',
              path: `/preapproval/${encodeURIComponent(oldId)}`,
              body: { status: 'cancelled' },
            })
          } catch (e) { logWarn('checkout_recurring', `Failed to cancel old preapproval ${oldId}`, e) }
        }
        await admin
          .from('app_subscriptions')
          .update({ status: 'cancelled', updated_at: new Date().toISOString() })
          .eq('id', sub.id)
      }
    } catch (e) { logWarn('checkout_recurring', 'Cancel old subs scan failed', e) }

    const amount = Number(plan.price_cents) / 100
    const baseUrl = resolveBaseUrl(req)
    const externalRef = `teacher_plan_recurring:${user.id}:${planId}`

    let preapproval: Record<string, unknown>
    try {
      preapproval = await mercadopagoRequest<Record<string, unknown>>({
        method: 'POST',
        path: '/preapproval',
        body: {
          reason: `IronTracks — Plano ${plan.name}`,
          external_reference: externalRef,
          payer_email: user.email || undefined,
          back_url: `${baseUrl}/auth/callback?from=teacher_checkout_recurring`,
          notification_url: `${baseUrl}/api/billing/webhooks/mercadopago`,
          status: 'pending',
          auto_recurring: {
            frequency: 1,
            frequency_type: 'months',
            transaction_amount: amount,
            currency_id: String(plan.currency || 'BRL'),
          },
        },
      })
    } catch (mpErr: unknown) {
      logError('teacher_checkout_recurring', 'MercadoPago Preapproval failed', { userId: user.id, planId, error: getErrorMessage(mpErr) })
      return NextResponse.json({ ok: false, error: getErrorMessage(mpErr) || 'pagamento_falhou' }, { status: 502 })
    }

    const subscriptionId = String(preapproval?.id ?? '').trim()
    const initPoint = String(preapproval?.init_point ?? '').trim()
    if (!subscriptionId || !initPoint) {
      return NextResponse.json({ ok: false, error: 'preapproval_invalido' }, { status: 502 })
    }

    // Persist pending subscription locally so the webhook can reconcile.
    try {
      await admin
        .from('app_subscriptions')
        .insert({
          user_id: user.id,
          plan_id: planId,                          // teacher tier key (NOT app_plans FK)
          provider: 'mercadopago',
          provider_subscription_id: subscriptionId,
          status: 'pending',
          metadata: {
            scope: 'teacher_plan_recurring',
            tier_key: planId,
            plan_name: plan.name,
            init_point: initPoint,
            mercadopago: { raw: preapproval },
          },
        })
    } catch (e) {
      // app_subscriptions has a FK to app_plans, which DOES NOT contain teacher
      // tier keys. Some deployments allow null; if FK fails, retry with
      // metadata.tier_key only. The webhook handler joins via
      // provider_subscription_id, so plan_id being null is OK.
      logWarn('teacher_checkout_recurring', 'Initial insert failed, retrying without plan_id FK', e)
      try {
        await admin
          .from('app_subscriptions')
          .insert({
            user_id: user.id,
            plan_id: null as unknown as string,
            provider: 'mercadopago',
            provider_subscription_id: subscriptionId,
            status: 'pending',
            metadata: {
              scope: 'teacher_plan_recurring',
              tier_key: planId,
              plan_name: plan.name,
              init_point: initPoint,
              mercadopago: { raw: preapproval },
            },
          })
      } catch (e2) { logWarn('teacher_checkout_recurring', 'Retry insert also failed', e2) }
    }

    return NextResponse.json({
      ok: true,
      subscription_id: subscriptionId,
      init_point: initPoint,
      plan: { id: plan.tier_key, name: plan.name },
      amount,
    })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}
