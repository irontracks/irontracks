/**
 * POST /api/billing/webhooks/mercadopago
 *
 * Auditoria de cobranças 14/08/2026 (A4/A5/A6):
 *  - TODA escrita de efeito financeiro verifica `{ error }` e responde 500 em
 *    falha — o Mercado Pago reenvia o evento. O supabase-js NÃO lança exceção:
 *    antes, um insert/update falhando saía como 200 e o provedor dava o evento
 *    por entregue (pagamento aprovado sem plano, estorno sem revogação).
 *  - As JANELAS são ancoradas em datas do PROVEDOR (date_approved do pagamento,
 *    next_payment_date da preapproval), não em "agora": reentrega do mesmo
 *    pagamento recomputa a MESMA validade — idempotente por construção.
 *  - Estorno revoga SÓ o benefício do pagamento estornado (entitlement
 *    `payment:<id>` e a assinatura ligada àquele pagamento), nunca tudo do
 *    usuário — estorno antigo não pode derrubar uma recompra válida.
 */
import { NextResponse } from 'next/server'
import { logError, logWarn } from '@/lib/logger'
import { z } from 'zod'
import {
  verifyWebhook,
  mapSubscriptionStatus,
  addInterval,
  assessPaymentAmount,
  isRevokeStatus,
  parseExternalReference,
} from '@/utils/billing/mercadopagoWebhookRules'
import { createAdminClient } from '@/utils/supabase/admin'
import { mercadopagoRequest } from '@/lib/mercadopago'
import { parseJsonBody } from '@/utils/zod'
import { env } from '@/utils/env'
import { cacheDelete } from '@/utils/cache'
import { respondDbError } from '@/utils/api/dbError'

export const dynamic = 'force-dynamic'

// Invalida os caches de VIP do usuário após conceder/revogar entitlement. Sem isto, o
// comprador via MercadoPago ficava com o cache antigo (vip:access TTL 30s / bootstrap)
// e não via o VIP na hora — o webhook do RevenueCat já fazia isso; o de MP não.
// Best-effort: falha na invalidação não quebra o webhook.
async function bustVipCaches(userId: string) {
  const uid = String(userId || '').trim()
  if (!uid) return
  await Promise.all([
    cacheDelete(`vip:access:${uid}`).catch(() => {}),
    cacheDelete(`dashboard:bootstrap:${uid}`).catch(() => {}),
  ])
}

/**
 * Âncora temporal vinda do PROVEDOR. Reentrega do mesmo evento produz a mesma
 * janela — usar `new Date()` aqui fazia cada reentrega ESTENDER o plano de novo
 * (A5). Fallback para "agora" só quando o MP não mandou data nenhuma.
 */
function providerAnchor(...candidates: Array<unknown>): Date {
  for (const c of candidates) {
    if (!c) continue
    const d = new Date(String(c))
    if (Number.isFinite(d.getTime())) return d
  }
  return new Date()
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
  const secret = env.mercadopago.webhookSecret.trim()
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
    // Log do evento: telemetria, não gate — falha aqui não pode barrar o
    // dinheiro. Duplicata (23505 no índice request_id/data_id) é esperada em
    // reentrega e o processamento SEGUE: os efeitos abaixo são idempotentes
    // (janelas ancoradas no provedor + upserts por chave), então reprocessar
    // converge para o mesmo estado.
    {
      const { error: evErr } = await admin
        .from('mercadopago_webhook_events')
        .insert({
          request_id: xRequestId,
          event_type: eventType || null,
          action: action || null,
          data_id: dataId,
          payload: body,
        })
      if (evErr && (evErr as { code?: string }).code !== '23505') {
        logError('billing:webhooks:mp:event-log', evErr)
      }
    }

    if (eventType === 'preapproval' || action.startsWith('preapproval.')) {
      const preapproval = await mercadopagoRequest<Record<string, unknown>>({
        method: 'GET',
        path: `/preapproval/${encodeURIComponent(dataId)}`,
      })

      const status = mapSubscriptionStatus(String(preapproval?.status || ''))
      const providerSubscriptionId = String(preapproval?.id || dataId).trim()

      const meta = preapproval && typeof preapproval === 'object' ? { mercadopago: { raw: preapproval } } : { mercadopago: {} }

      // Fix #4: Preserve existing metadata instead of overwriting
      const { data: existingSub } = await admin
        .from('app_subscriptions')
        .select('metadata')
        .eq('provider', 'mercadopago')
        .eq('provider_subscription_id', providerSubscriptionId)
        .maybeSingle()
      const existingMeta = existingSub?.metadata && typeof existingSub.metadata === 'object' ? existingSub.metadata : {}
      const mergedMeta = { ...existingMeta as Record<string, unknown>, ...meta }

      {
        const { error } = await admin
          .from('app_subscriptions')
          .update({ status, updated_at: new Date().toISOString(), metadata: mergedMeta })
          .eq('provider', 'mercadopago')
          .eq('provider_subscription_id', providerSubscriptionId)
        if (error) return respondDbError('mp:webhook:preapproval:sub-status', error, 500)
      }

      if (status === 'active') {
        const { data: sub } = await admin
          .from('app_subscriptions')
          .select('id, user_id, plan_id, metadata')
          .eq('provider', 'mercadopago')
          .eq('provider_subscription_id', providerSubscriptionId)
          .maybeSingle()
        if (sub?.user_id) {
          // Detect recurring teacher plan via metadata.scope — different
          // table to update than the VIP entitlement flow.
          const subMeta = (sub.metadata ?? {}) as Record<string, unknown>
          const subScope = String(subMeta?.scope || '').trim()

          // Fim do período vindo do PROVEDOR: next_payment_date é quando o MP
          // vai cobrar de novo — é o fim real do período pago (A5). Fallback:
          // agora + intervalo, só quando a preapproval não trouxe a data.
          const now = new Date()
          const nextPayment = preapproval?.next_payment_date

          if (subScope === 'teacher_plan_recurring') {
            const tierKey = String(subMeta?.tier_key || sub.plan_id || 'free').trim()
            const end = providerAnchor(nextPayment, addInterval(now, 'month').toISOString())

            {
              const { error } = await admin
                .from('teachers')
                .update({
                  plan_tier_key:        tierKey,
                  plan_status:          'active',
                  plan_valid_until:     end.toISOString(),
                  plan_subscription_id: providerSubscriptionId,
                })
                .eq('user_id', sub.user_id)
              if (error) return respondDbError('mp:webhook:preapproval:teacher', error, 500)
            }

            {
              const { error } = await admin
                .from('app_subscriptions')
                .update({
                  current_period_start: now.toISOString(),
                  current_period_end: end.toISOString(),
                  updated_at: now.toISOString(),
                })
                .eq('id', sub.id)
              if (error) return respondDbError('mp:webhook:preapproval:teacher-sub', error, 500)
            }
          } else {
            // VIP / app-plans flow
            const { data: plan } = await admin.from('app_plans').select('id, interval').eq('id', sub.plan_id).maybeSingle()
            const fallbackEnd = plan?.interval ? addInterval(now, String(plan.interval)).toISOString() : null
            const end = nextPayment || fallbackEnd ? providerAnchor(nextPayment, fallbackEnd).toISOString() : null
            {
              const { error } = await admin
                .from('user_entitlements')
                .upsert(
                  {
                    user_id: sub.user_id,
                    plan_id: sub.plan_id,
                    status: 'active',
                    provider: 'mercadopago',
                    provider_subscription_id: providerSubscriptionId,
                    current_period_start: now.toISOString(),
                    current_period_end: end,
                    valid_from: now.toISOString(),
                    valid_until: end,
                    metadata: { mercadopago: { kind: 'preapproval', subscription_id: providerSubscriptionId, raw: preapproval } },
                  },
                  { onConflict: 'user_id,provider,provider_subscription_id' },
                )
              if (error) return respondDbError('mp:webhook:preapproval:entitlement', error, 500)
            }
            {
              const { error } = await admin
                .from('app_subscriptions')
                .update({
                  current_period_start: now.toISOString(),
                  current_period_end: end,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', sub.id)
              if (error) return respondDbError('mp:webhook:preapproval:vip-sub', error, 500)
            }
            // VIP concedido/renovado por preapproval → invalida o cache pra refletir na hora.
            await bustVipCaches(sub.user_id)
          }
        }
      }

      // Cancellation reflected on teachers row when scope=teacher_plan_recurring
      if (status === 'cancelled') {
        const { data: sub } = await admin
          .from('app_subscriptions')
          .select('user_id, metadata')
          .eq('provider', 'mercadopago')
          .eq('provider_subscription_id', providerSubscriptionId)
          .maybeSingle()
        const subMeta = (sub?.metadata ?? {}) as Record<string, unknown>
        if (sub?.user_id && String(subMeta?.scope || '') === 'teacher_plan_recurring') {
          const { error } = await admin
            .from('app_subscriptions')
            .update({ cancel_at_period_end: true, updated_at: new Date().toISOString() })
            .eq('provider', 'mercadopago')
            .eq('provider_subscription_id', providerSubscriptionId)
          if (error) return respondDbError('mp:webhook:preapproval:cancel', error, 500)
          // teachers.plan_status flip happens at expiry time via the suspend
          // cron — until plan_valid_until passes, the teacher keeps access.
        }
      }

      return NextResponse.json({ ok: true })
    }

    if (eventType === 'payment' || action.startsWith('payment.')) {
      const payment = await mercadopagoRequest<Record<string, unknown>>({
        method: 'GET',
        path: `/v1/payments/${encodeURIComponent(dataId)}`,
      })

      // Ler por posição aqui já custou caro: o fluxo do aluno pegava a
      // assinatura da posição errada. O parser vive junto do builder usado
      // pelos checkouts, com teste de ida e volta.
      const parsedRef = parseExternalReference(payment?.external_reference)
      const scope = parsedRef.scope
      const userId = parsedRef.scope === 'student_plan'
        ? parsedRef.teacherUserId
        : parsedRef.scope === 'unknown' ? '' : parsedRef.userId
      const planId = parsedRef.scope === 'teacher_plan'
        ? parsedRef.tierKey
        : parsedRef.scope === 'student_plan' ? parsedRef.planId
        : parsedRef.scope === 'vip' ? parsedRef.planId : ''
      const amount = Number(payment?.transaction_amount || 0)
      const amountCents = Math.round((Number.isFinite(amount) ? amount : 0) * 100)
      const currency = String(payment?.currency_id || 'BRL').trim().toUpperCase()
      const status = String(payment?.status || 'pending').trim()

      const meta = payment && typeof payment === 'object' ? { mercadopago: { raw: payment } } : { mercadopago: {} }

      // A âncora do período é a data em que o PROVEDOR aprovou o pagamento —
      // reentrega recomputa a mesma janela (A5).
      const anchor = providerAnchor(payment?.date_approved, payment?.date_created)

      // ── student_plan: activate student subscription ───────────────────────────
      // external_reference format: student_plan:teacherUserId:planId:studentUserId:subscriptionId
      if (scope === 'student_plan' && userId) {
        const subscriptionId = parsedRef.scope === 'student_plan' ? parsedRef.subscriptionId : ''

        if (status.toLowerCase() === 'approved' && subscriptionId) {
          // Load subscription to get duration + price (price p/ a validação de valor)
          const { data: sub } = await admin
            .from('student_subscriptions')
            .select('id, plan_id, student_service_plans(duration_days, price_cents)')
            .eq('id', subscriptionId)
            .maybeSingle()

          const planData = sub?.student_service_plans
          const planRow = (Array.isArray(planData) ? planData[0] : planData) as { duration_days?: number; price_cents?: number } | null | undefined
          const durationDays = Number(planRow?.duration_days ?? 30)

          const amt = assessPaymentAmount(amountCents, planRow?.price_cents, currency, undefined)
          if (amt.mismatch) logWarn('billing:webhooks:mp', `student_plan amount mismatch — ${amt.detail}`, { userId, subscriptionId, dataId })
          if (amt.block) {
            logError('billing:webhooks:mp', new Error(`student_plan grant BLOQUEADO por valor — ${amt.detail} sub=${subscriptionId} dataId=${dataId}`))
            return NextResponse.json({ ok: true, skipped: 'amount_mismatch' })
          }
          const expires = new Date(anchor)
          expires.setDate(expires.getDate() + durationDays)

          const nextDue = new Date(expires)
          nextDue.setDate(nextDue.getDate() - 5) // 5 days before expiry

          {
            const { error } = await admin
              .from('student_subscriptions')
              .update({
                status: 'active',
                started_at: anchor.toISOString(),
                expires_at: expires.toISOString(),
                last_payment_at: anchor.toISOString(),
                next_due_date: nextDue.toISOString().slice(0, 10),
                provider_subscription_id: dataId,
                updated_at: new Date().toISOString(),
              })
              .eq('id', subscriptionId)
            if (error) return respondDbError('mp:webhook:student:activate', error, 500)
          }

          // Mark charge as approved
          {
            const { error } = await admin
              .from('student_charges')
              .update({ status: 'approved', paid_at: anchor.toISOString() })
              .eq('provider_payment_id', dataId)
            if (error) return respondDbError('mp:webhook:student:charge', error, 500)
          }
        }

        if (isRevokeStatus(status) && subscriptionId) {
          const { error } = await admin
            .from('student_subscriptions')
            .update({ status: 'cancelled', updated_at: new Date().toISOString() })
            .eq('id', subscriptionId)
          if (error) return respondDbError('mp:webhook:student:revoke', error, 500)
        }

        return NextResponse.json({ ok: true })
      }

      // ── teacher_plan: activate/renew plan on teacher row + invoice ──────────
      if (scope === 'teacher_plan' && userId) {
        if (status.toLowerCase() === 'approved') {
          const { data: tier } = await admin.from('teacher_tiers').select('price_cents, currency').eq('tier_key', planId).maybeSingle()
          const amt = assessPaymentAmount(amountCents, tier?.price_cents as number | undefined, currency, tier?.currency as string | undefined)
          if (amt.mismatch) logWarn('billing:webhooks:mp', `teacher_plan amount mismatch — ${amt.detail}`, { userId, planId, dataId })
          if (amt.block) {
            logError('billing:webhooks:mp', new Error(`teacher_plan grant BLOQUEADO por valor — ${amt.detail} userId=${userId} planId=${planId} dataId=${dataId}`))
            return NextResponse.json({ ok: true, skipped: 'amount_mismatch' })
          }
          const end = addInterval(anchor, 'month') // monthly billing, ancorado na aprovação

          const { error } = await admin
            .from('teachers')
            .update({
              plan_tier_key:        planId || 'free',
              plan_status:          'active',
              plan_valid_until:     end.toISOString(),
              plan_subscription_id: dataId,
            })
            .eq('user_id', userId)
          if (error) return respondDbError('mp:webhook:teacher:activate', error, 500)
        }

        if (isRevokeStatus(status)) {
          const { error } = await admin
            .from('teachers')
            .update({ plan_tier_key: 'free', plan_status: 'cancelled', plan_valid_until: null })
            .eq('user_id', userId)
          if (error) return respondDbError('mp:webhook:teacher:revoke', error, 500)
        }

        // Mirror the payment status into app_payments so "Minhas Faturas"
        // reflects approved / refunded / cancelled within seconds of the
        // webhook firing. Upsert keyed on (provider, provider_payment_id) —
        // matches the row inserted at checkout time.
        {
          const { error } = await admin
            .from('app_payments')
            .upsert(
              {
                user_id: userId,
                plan_id: null,
                subscription_id: null,
                amount_cents: amountCents,
                currency,
                status: status.toLowerCase(),
                provider: 'mercadopago',
                provider_payment_id: dataId,
                paid_at: status.toLowerCase() === 'approved' ? anchor.toISOString() : null,
                raw: { ...meta, scope: 'teacher_plan', tier_key: planId },
              },
              { onConflict: 'provider,provider_payment_id' },
            )
          if (error) return respondDbError('mp:webhook:teacher:invoice', error, 500)
        }

        return NextResponse.json({ ok: true })
      }

      if (scope === 'vip' && userId) {
        const now = new Date()
        const { data: plan } = planId ? await admin.from('app_plans').select('id, interval, price_cents, currency').eq('id', planId).maybeSingle() : { data: null }
        const end = plan?.interval ? addInterval(anchor, String(plan.interval)) : null

        const { data: activeSub } = await admin
          .from('app_subscriptions')
          .select('id, status')
          .eq('provider', 'mercadopago')
          .eq('user_id', userId)
          .in('status', ['pending', 'active', 'past_due'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        {
          const { error } = await admin
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
          if (error) return respondDbError('mp:webhook:vip:payment-row', error, 500)
        }

        if (status.toLowerCase() === 'approved') {
          const amt = assessPaymentAmount(amountCents, plan?.price_cents as number | undefined, currency, plan?.currency as string | undefined)
          if (amt.mismatch) logWarn('billing:webhooks:mp', `vip amount mismatch — ${amt.detail}`, { userId, planId, dataId })
          if (amt.block) {
            logError('billing:webhooks:mp', new Error(`vip grant BLOQUEADO por valor — ${amt.detail} userId=${userId} planId=${planId} dataId=${dataId}`))
            return NextResponse.json({ ok: true, skipped: 'amount_mismatch' })
          }
          const entSubId = activeSub?.id ? String(activeSub.id) : ''
          {
            const { error } = await admin
              .from('app_subscriptions')
              .update({
                status: 'active',
                current_period_start: anchor.toISOString(),
                current_period_end: end ? end.toISOString() : null,
                updated_at: new Date().toISOString(),
              })
              .eq('provider', 'mercadopago')
              .eq('user_id', userId)
              .in('status', ['pending', 'past_due'])
            if (error) return respondDbError('mp:webhook:vip:sub-activate', error, 500)
          }

          {
            const { error } = await admin
              .from('user_entitlements')
              .upsert(
                {
                  user_id: userId,
                  plan_id: planId || null,
                  status: 'active',
                  provider: 'mercadopago',
                  provider_subscription_id: `payment:${dataId}`,
                  current_period_start: anchor.toISOString(),
                  current_period_end: end ? end.toISOString() : null,
                  valid_from: anchor.toISOString(),
                  valid_until: end ? end.toISOString() : null,
                  metadata: { mercadopago: { kind: 'payment', payment_id: dataId, subscription_id: entSubId || null, raw: payment } },
                },
                // Índice único é (user_id, provider, provider_subscription_id). `payment:${dataId}`
                // já é único por usuário (id global do pagamento MP), então incluir user_id é
                // no-op de comportamento e casa com o índice — sem ele o upsert lança 42P10.
                { onConflict: 'user_id,provider,provider_subscription_id' },
              )
            if (error) return respondDbError('mp:webhook:vip:entitlement', error, 500)
          }
        }

        // Fix #3 (reescopado na auditoria 14/08/2026, A6): estorno/chargeback
        // revoga SÓ o benefício do pagamento estornado — o entitlement
        // `payment:<id>` e, se o pagamento pertencer a uma assinatura, a
        // assinatura/entitlement DAQUELA cadeia. Revogar tudo do usuário
        // derrubava recompras válidas por causa de um estorno antigo.
        if (isRevokeStatus(status)) {
          const revokeMeta = {
            mercadopago: {
              kind: 'payment_revoked',
              payment_id: dataId,
              revoke_reason: status.toLowerCase(),
              revoked_at: now.toISOString(),
              raw: payment,
            },
          }

          // 1) o entitlement do PRÓPRIO pagamento (PIX avulso)
          {
            const { error } = await admin
              .from('user_entitlements')
              .update({ status: 'revoked', valid_until: now.toISOString(), metadata: revokeMeta })
              .eq('user_id', userId)
              .eq('provider', 'mercadopago')
              .eq('provider_subscription_id', `payment:${dataId}`)
              .in('status', ['active', 'trialing'])
            if (error) return respondDbError('mp:webhook:vip:revoke-payment-ent', error, 500)
          }

          // 2) a assinatura à qual o pagamento pertence (preapproval) — via o
          // vínculo gravado em app_payments na aprovação.
          const { data: payRow } = await admin
            .from('app_payments')
            .select('id, subscription_id')
            .eq('provider', 'mercadopago')
            .eq('provider_payment_id', dataId)
            .maybeSingle()

          if (payRow?.subscription_id) {
            const { data: linkedSub } = await admin
              .from('app_subscriptions')
              .select('id, provider_subscription_id')
              .eq('id', payRow.subscription_id)
              .maybeSingle()

            if (linkedSub?.id) {
              {
                const { error } = await admin
                  .from('app_subscriptions')
                  .update({ status: 'cancelled', updated_at: now.toISOString() })
                  .eq('id', linkedSub.id)
                if (error) return respondDbError('mp:webhook:vip:revoke-sub', error, 500)
              }
              if (linkedSub.provider_subscription_id) {
                const { error } = await admin
                  .from('user_entitlements')
                  .update({ status: 'revoked', valid_until: now.toISOString(), metadata: revokeMeta })
                  .eq('user_id', userId)
                  .eq('provider', 'mercadopago')
                  .eq('provider_subscription_id', String(linkedSub.provider_subscription_id))
                  .in('status', ['active', 'trialing'])
                if (error) return respondDbError('mp:webhook:vip:revoke-sub-ent', error, 500)
              }
            }
          } else {
            logWarn('billing:webhooks:mp', 'estorno sem assinatura vinculada em app_payments — só o entitlement do pagamento foi revogado', { userId, dataId })
          }
        }

        // VIP concedido (payment aprovado) ou revogado (refund/chargeback) → invalida o
        // cache do usuário pra refletir na hora (evita ficar FREE por até 30s pós-compra).
        await bustVipCaches(userId)

        return NextResponse.json({ ok: true })
      }

      return NextResponse.json({ ok: true, ignored: true })
    }

    return NextResponse.json({ ok: true, ignored: true })
  } catch (e: unknown) {
    // Não vaza mensagem de erro interna ao caller (endpoint público). Loga server-side
    // e responde genérico. Auditoria 2026-06-28 (R2).
    logError('webhook:mercadopago', e)
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 })
  }
}
