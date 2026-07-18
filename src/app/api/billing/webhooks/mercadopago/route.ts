import { NextResponse } from 'next/server'
import { logError, logWarn } from '@/lib/logger'
import crypto from 'crypto'
import { z } from 'zod'
import { createAdminClient } from '@/utils/supabase/admin'
import { mercadopagoRequest } from '@/lib/mercadopago'
import { parseJsonBody } from '@/utils/zod'
import { env } from '@/utils/env'
import { cacheDelete } from '@/utils/cache'

export const dynamic = 'force-dynamic'

// Invalida os caches de VIP do usuário após conceder/revogar entitlement. Sem isto, o
// comprador via MercadoPago ficava com o cache antigo (vip:access TTL 30s / bootstrap)
// e não via o VIP na hora — os webhooks de RevenueCat/Asaas já faziam isso; o de MP não.
// Best-effort: falha na invalidação não quebra o webhook.
async function bustVipCaches(userId: string) {
  const uid = String(userId || '').trim()
  if (!uid) return
  await Promise.all([
    cacheDelete(`vip:access:${uid}`).catch(() => {}),
    cacheDelete(`dashboard:bootstrap:${uid}`).catch(() => {}),
  ])
}

const parseSignature = (raw: string) => {
  const parts = raw.split(',').map((p) => p.trim()).filter(Boolean)
  let ts = ''
  let v1 = ''
  for (const part of parts) {
    const [k, v] = part.split('=').map((s) => (s || '').trim())
    if (k === 'ts') ts = v || ''
    if (k === 'v1') v1 = v || ''
  }
  return { ts, v1 }
}

const WEBHOOK_TOLERANCE_MS = 5 * 60 * 1000 // 5 minutes

const verifyWebhook = (opts: { secret: string; xSignature: string; xRequestId: string; dataId: string }) => {
  const { ts, v1 } = parseSignature(opts.xSignature)
  if (!ts || !v1) return false

  // Replay protection: reject if timestamp is older than 5 minutes
  const tsMs = Number(ts) * 1000
  if (!Number.isFinite(tsMs) || Math.abs(Date.now() - tsMs) > WEBHOOK_TOLERANCE_MS) return false

  const manifest = `id:${opts.dataId};request-id:${opts.xRequestId};ts:${ts};`
  const hashed = crypto.createHmac('sha256', opts.secret).update(manifest).digest('hex')
  return hashed.toLowerCase() === v1.toLowerCase()
}

const mapSubscriptionStatus = (status: string) => {
  const s = (status || '').toLowerCase()
  if (['authorized', 'approved'].includes(s)) return 'active'
  if (['paused'].includes(s)) return 'past_due'
  if (['cancelled', 'canceled'].includes(s)) return 'cancelled'
  return 'pending'
}

const addInterval = (start: Date, interval: string) => {
  const d = new Date(start)
  if (String(interval || '').toLowerCase() === 'year') {
    d.setMonth(d.getMonth() + 12)
    return d
  }
  d.setMonth(d.getMonth() + 1)
  return d
}

/**
 * Defense-in-depth (auditoria 2026-06-28): confere o valor pago vs o preço do plano
 * antes de conceder acesso. NÃO é externamente explorável (valor é fixado no checkout
 * server-side + webhook tem HMAC + dados vêm da API do MP), mas protege contra bug de
 * checkout ou fluxo futuro. Política CONSERVADORA pra nunca barrar receita legítima:
 *   - sem preço de referência no banco  -> não bloqueia (fail-open);
 *   - mismatch leve (preço mudou, arredondamento) -> só sinaliza (alerta), concede;
 *   - mismatch GRAVE (pago < 50% do esperado, ou moeda divergente) -> bloqueia o grant.
 * Como não há cupom/desconto e o valor é server-fixed, < 50% só pode ser bug/fraude.
 */
function assessPaymentAmount(
  paidCents: number,
  expectedCents: number | null | undefined,
  paidCurrency: string,
  expectedCurrency: string | null | undefined,
): { block: boolean; mismatch: boolean; detail: string } {
  const expected = Number(expectedCents || 0)
  if (!Number.isFinite(expected) || expected <= 0) {
    return { block: false, mismatch: false, detail: 'no_reference_price' }
  }
  const paid = Number.isFinite(paidCents) ? paidCents : 0
  const curExpected = String(expectedCurrency || '').trim().toUpperCase()
  const currencyOk = !curExpected || String(paidCurrency || '').toUpperCase() === curExpected
  const ratio = expected > 0 ? paid / expected : 1
  const block = !currencyOk || ratio < 0.5
  const mismatch = !currencyOk || Math.abs(paid - expected) > 2
  const detail = `paid=${paid} expected=${expected} paidCur=${paidCurrency} expCur=${curExpected || 'n/a'} ratio=${ratio.toFixed(3)}`
  return { block, mismatch, detail }
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
    try {
      await admin
        .from('mercadopago_webhook_events')
        .insert({
          request_id: xRequestId,
          event_type: eventType || null,
          action: action || null,
          data_id: dataId,
          payload: body,
        })
    } catch (e) { logWarn('billing:webhooks:mp', 'silenced', e) }

    if (eventType === 'preapproval' || action.startsWith('preapproval.')) {
      const preapproval = await mercadopagoRequest<Record<string, unknown>>({
        method: 'GET',
        path: `/preapproval/${encodeURIComponent(dataId)}`,
      })

      const status = mapSubscriptionStatus(String(preapproval?.status || ''))
      const providerSubscriptionId = String(preapproval?.id || dataId).trim()

      const meta = preapproval && typeof preapproval === 'object' ? { mercadopago: { raw: preapproval } } : { mercadopago: {} }

      // ── student_plan_recurring: assinatura por cartão do ALUNO ────────────────
      // O aluno guarda o preapproval em student_subscriptions.preapproval_id (não em
      // app_subscriptions). Trata aqui e retorna cedo. O ciclo de cobrança (started/expires/
      // next_due/last_payment) é do ramo de `payment`; aqui só reflete o ESTADO da assinatura.
      // external_reference: student_plan_recurring:teacher:plan:student:sub
      {
        const extRef = String(preapproval?.external_reference || '').trim()
        if (extRef.startsWith('student_plan_recurring:')) {
          const subId = extRef.split(':')[4]
          const nowIso = new Date().toISOString()
          if (subId) {
            if (status === 'cancelled') {
              await admin.from('student_subscriptions')
                .update({ status: 'cancelled', canceled_at: nowIso, updated_at: nowIso })
                .eq('id', subId)
            } else if (status === 'active') {
              await admin.from('student_subscriptions')
                .update({ status: 'active', recurring: true, billing_method: 'card', preapproval_id: providerSubscriptionId, updated_at: nowIso })
                .eq('id', subId)
            } else {
              // pending/past_due/etc. — reflete o estado mapeado sem mexer no ciclo.
              await admin.from('student_subscriptions').update({ status, updated_at: nowIso }).eq('id', subId)
            }
          }
          return NextResponse.json({ ok: true })
        }
      }

      // Fix #4: Preserve existing metadata instead of overwriting
      const { data: existingSub } = await admin
        .from('app_subscriptions')
        .select('metadata')
        .eq('provider', 'mercadopago')
        .eq('provider_subscription_id', providerSubscriptionId)
        .maybeSingle()
      const existingMeta = existingSub?.metadata && typeof existingSub.metadata === 'object' ? existingSub.metadata : {}
      const mergedMeta = { ...existingMeta as Record<string, unknown>, ...meta }

      await admin
        .from('app_subscriptions')
        .update({ status, updated_at: new Date().toISOString(), metadata: mergedMeta })
        .eq('provider', 'mercadopago')
        .eq('provider_subscription_id', providerSubscriptionId)

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

          if (subScope === 'teacher_plan_recurring') {
            const tierKey = String(subMeta?.tier_key || sub.plan_id || 'free').trim()
            const now = new Date()
            const end = new Date(now); end.setMonth(end.getMonth() + 1)

            await admin
              .from('teachers')
              .update({
                plan_tier_key:        tierKey,
                plan_status:          'active',
                plan_valid_until:     end.toISOString(),
                plan_subscription_id: providerSubscriptionId,
              })
              .eq('user_id', sub.user_id)

            await admin
              .from('app_subscriptions')
              .update({
                current_period_start: now.toISOString(),
                current_period_end: end.toISOString(),
                updated_at: now.toISOString(),
              })
              .eq('id', sub.id)
          } else {
            // VIP / app-plans flow (unchanged)
            const { data: plan } = await admin.from('app_plans').select('id, interval').eq('id', sub.plan_id).maybeSingle()
            const now = new Date()
            const end = plan?.interval ? addInterval(now, String(plan.interval)) : null
            await admin
              .from('user_entitlements')
              .upsert(
                {
                  user_id: sub.user_id,
                  plan_id: sub.plan_id,
                  status: 'active',
                  provider: 'mercadopago',
                  provider_subscription_id: providerSubscriptionId,
                  current_period_start: now.toISOString(),
                  current_period_end: end ? end.toISOString() : null,
                  valid_from: now.toISOString(),
                  valid_until: end ? end.toISOString() : null,
                  metadata: { mercadopago: { kind: 'preapproval', subscription_id: providerSubscriptionId, raw: preapproval } },
                },
                { onConflict: 'user_id,provider,provider_subscription_id' },
              )
            await admin
              .from('app_subscriptions')
              .update({
                current_period_start: now.toISOString(),
                current_period_end: end ? end.toISOString() : null,
                updated_at: new Date().toISOString(),
              })
              .eq('id', sub.id)
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
          await admin
            .from('app_subscriptions')
            .update({ cancel_at_period_end: true, updated_at: new Date().toISOString() })
            .eq('provider', 'mercadopago')
            .eq('provider_subscription_id', providerSubscriptionId)
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

      const externalRef = String(payment?.external_reference || '').trim()
      const [scope, userId, planId] = externalRef.split(':')
      const amount = Number(payment?.transaction_amount || 0)
      const amountCents = Math.round((Number.isFinite(amount) ? amount : 0) * 100)
      const currency = String(payment?.currency_id || 'BRL').trim().toUpperCase()
      const status = String(payment?.status || 'pending').trim()

      const meta = payment && typeof payment === 'object' ? { mercadopago: { raw: payment } } : { mercadopago: {} }

      // ── student_plan: activate student subscription ───────────────────────────
      // external_reference format: student_plan:teacherUserId:planId:studentUserId:subscriptionId
      if (scope === 'student_plan' && userId) {
        // subscriptionId é o 5º campo (índice 4). ANTES lia índice 3 (studentUserId) — a
        // assinatura nunca ativava (o update .eq('id', <studentUserId>) não casava linha
        // nenhuma). Latente porque produção tinha 0 assinaturas; corrigido na Fase 8.
        const subscriptionId = externalRef.split(':')[4]

        if (status.toLowerCase() === 'approved' && subscriptionId) {
          const now = new Date()

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
          const expires = new Date(now)
          expires.setDate(expires.getDate() + durationDays)

          const nextDue = new Date(expires)
          nextDue.setDate(nextDue.getDate() - 5) // 5 days before expiry

          await admin
            .from('student_subscriptions')
            .update({
              status: 'active',
              started_at: now.toISOString(),
              expires_at: expires.toISOString(),
              last_payment_at: now.toISOString(),
              next_due_date: nextDue.toISOString().slice(0, 10),
              provider_subscription_id: dataId,
              updated_at: now.toISOString(),
            })
            .eq('id', subscriptionId)

          // Mark charge as approved
          await admin
            .from('student_charges')
            .update({ status: 'approved', paid_at: now.toISOString() })
            .eq('provider_payment_id', dataId)
        }

        const revokeStatuses = ['refunded', 'cancelled', 'charged_back', 'chargedback']
        if (revokeStatuses.includes(status.toLowerCase()) && subscriptionId) {
          await admin
            .from('student_subscriptions')
            .update({ status: 'cancelled', updated_at: new Date().toISOString() })
            .eq('id', subscriptionId)
        }

        return NextResponse.json({ ok: true })
      }

      // ── student_plan_recurring: cobrança RECORRENTE por cartão do ALUNO ───────
      // external_reference: student_plan_recurring:teacherUserId:planId:studentUserId:subscriptionId
      if (scope === 'student_plan_recurring' && userId) {
        const parts = externalRef.split(':')
        const teacherUserId = parts[1]
        const recPlanId = parts[2]
        const studentUserId = parts[3]
        const subscriptionId = parts[4]
        const now = new Date()

        if (status.toLowerCase() === 'approved' && subscriptionId) {
          const { data: sub } = await admin
            .from('student_subscriptions')
            .select('id, started_at, student_service_plans(duration_days, price_cents)')
            .eq('id', subscriptionId)
            .maybeSingle()
          const planData = sub?.student_service_plans
          const planRow = (Array.isArray(planData) ? planData[0] : planData) as { duration_days?: number; price_cents?: number } | null | undefined
          const durationDays = Number(planRow?.duration_days ?? 30)

          const amt = assessPaymentAmount(amountCents, planRow?.price_cents, currency, undefined)
          if (amt.mismatch) logWarn('billing:webhooks:mp', `student_plan_recurring amount mismatch — ${amt.detail}`, { subscriptionId, dataId })
          if (amt.block) {
            logError('billing:webhooks:mp', new Error(`student_plan_recurring grant BLOQUEADO por valor — ${amt.detail} sub=${subscriptionId} dataId=${dataId}`))
            return NextResponse.json({ ok: true, skipped: 'amount_mismatch' })
          }

          const expires = new Date(now); expires.setDate(expires.getDate() + durationDays)
          const nextDue = new Date(expires); nextDue.setDate(nextDue.getDate() - 5)
          const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`

          // Idempotente por provider_payment_id (o webhook pode reentregar). O índice único
          // (subscription_id, period) é a rede de segurança anti-cobrança-dupla no mesmo ciclo.
          const { data: existingCharge } = await admin
            .from('student_charges').select('id').eq('provider_payment_id', dataId).maybeSingle()
          if (!existingCharge) {
            const { error: insErr } = await admin.from('student_charges').insert({
              subscription_id: subscriptionId,
              teacher_user_id: teacherUserId,
              student_user_id: studentUserId,
              plan_id: recPlanId,
              amount_cents: amountCents,
              currency,
              status: 'approved',
              provider: 'mercadopago',
              provider_payment_id: dataId,
              period,
              paid_at: now.toISOString(),
              raw: payment,
            })
            if (insErr) logWarn('billing:webhooks:mp', `student_plan_recurring charge insert falhou (provável duplicata de ciclo) — ${insErr.message}`, { subscriptionId, period })
          }

          await admin.from('student_subscriptions').update({
            status: 'active',
            started_at: sub?.started_at || now.toISOString(),
            expires_at: expires.toISOString(),
            last_payment_at: now.toISOString(),
            next_due_date: nextDue.toISOString().slice(0, 10),
            dunning_attempts: 0,
            updated_at: now.toISOString(),
          }).eq('id', subscriptionId)

          return NextResponse.json({ ok: true })
        }

        const revokeStatuses = ['refunded', 'cancelled', 'charged_back', 'chargedback', 'rejected']
        if (revokeStatuses.includes(status.toLowerCase()) && subscriptionId) {
          await admin.from('student_charges').update({ status }).eq('provider_payment_id', dataId)
          // Cobrança recorrente falhou → assinatura fica past_due; o cron de suspensão trata a carência.
          await admin.from('student_subscriptions').update({ status: 'past_due', updated_at: now.toISOString() }).eq('id', subscriptionId)
        }

        return NextResponse.json({ ok: true })
      }

      // ── teacher_plan: activate/renew plan on teacher row + invoice ──────────
      if (scope === 'teacher_plan' && userId) {
        const now = new Date()
        if (status.toLowerCase() === 'approved') {
          const { data: tier } = await admin.from('teacher_tiers').select('price_cents, currency').eq('tier_key', planId).maybeSingle()
          const amt = assessPaymentAmount(amountCents, tier?.price_cents as number | undefined, currency, tier?.currency as string | undefined)
          if (amt.mismatch) logWarn('billing:webhooks:mp', `teacher_plan amount mismatch — ${amt.detail}`, { userId, planId, dataId })
          if (amt.block) {
            logError('billing:webhooks:mp', new Error(`teacher_plan grant BLOQUEADO por valor — ${amt.detail} userId=${userId} planId=${planId} dataId=${dataId}`))
            return NextResponse.json({ ok: true, skipped: 'amount_mismatch' })
          }
          const end = new Date(now)
          end.setMonth(end.getMonth() + 1) // monthly billing

          await admin
            .from('teachers')
            .update({
              plan_tier_key:        planId || 'free',
              plan_status:          'active',
              plan_valid_until:     end.toISOString(),
              plan_subscription_id: dataId,
            })
            .eq('user_id', userId)
        }

        const revokeStatuses = ['refunded', 'cancelled', 'charged_back', 'chargedback']
        if (revokeStatuses.includes(status.toLowerCase())) {
          await admin
            .from('teachers')
            .update({ plan_tier_key: 'free', plan_status: 'cancelled', plan_valid_until: null })
            .eq('user_id', userId)
        }

        // Mirror the payment status into app_payments so "Minhas Faturas"
        // reflects approved / refunded / cancelled within seconds of the
        // webhook firing. Upsert keyed on (provider, provider_payment_id) —
        // matches the row inserted at checkout time.
        try {
          await admin
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
                paid_at: status.toLowerCase() === 'approved' ? now.toISOString() : null,
                raw: { ...meta, scope: 'teacher_plan', tier_key: planId },
              },
              { onConflict: 'provider,provider_payment_id' },
            )
        } catch (e) { logWarn('billing:webhooks:mp', 'Could not mirror teacher_plan invoice', e) }

        return NextResponse.json({ ok: true })
      }

      if (scope === 'vip' && userId) {
        const now = new Date()
        const { data: plan } = planId ? await admin.from('app_plans').select('id, interval, price_cents, currency').eq('id', planId).maybeSingle() : { data: null }
        const end = plan?.interval ? addInterval(now, String(plan.interval)) : null

        const { data: activeSub } = await admin
          .from('app_subscriptions')
          .select('id, status')
          .eq('provider', 'mercadopago')
          .eq('user_id', userId)
          .in('status', ['pending', 'active', 'past_due'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        await admin
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

        if (status.toLowerCase() === 'approved') {
          const amt = assessPaymentAmount(amountCents, plan?.price_cents as number | undefined, currency, plan?.currency as string | undefined)
          if (amt.mismatch) logWarn('billing:webhooks:mp', `vip amount mismatch — ${amt.detail}`, { userId, planId, dataId })
          if (amt.block) {
            logError('billing:webhooks:mp', new Error(`vip grant BLOQUEADO por valor — ${amt.detail} userId=${userId} planId=${planId} dataId=${dataId}`))
            return NextResponse.json({ ok: true, skipped: 'amount_mismatch' })
          }
          const entSubId = activeSub?.id ? String(activeSub.id) : ''
          await admin
            .from('app_subscriptions')
            .update({
              status: 'active',
              current_period_start: now.toISOString(),
              current_period_end: end ? end.toISOString() : null,
              updated_at: new Date().toISOString(),
            })
            .eq('provider', 'mercadopago')
            .eq('user_id', userId)
            .in('status', ['pending', 'past_due'])

          await admin
            .from('user_entitlements')
            .upsert(
              {
                user_id: userId,
                plan_id: planId || null,
                status: 'active',
                provider: 'mercadopago',
                provider_subscription_id: `payment:${dataId}`,
                current_period_start: now.toISOString(),
                current_period_end: end ? end.toISOString() : null,
                valid_from: now.toISOString(),
                valid_until: end ? end.toISOString() : null,
                metadata: { mercadopago: { kind: 'payment', payment_id: dataId, subscription_id: entSubId || null, raw: payment } },
              },
              // Índice único é (user_id, provider, provider_subscription_id). `payment:${dataId}`
              // já é único por usuário (id global do pagamento MP), então incluir user_id é
              // no-op de comportamento e casa com o índice — sem ele o upsert lança 42P10.
              { onConflict: 'user_id,provider,provider_subscription_id' },
            )
        }

        // Fix #3: Revoke VIP on refund/chargeback/cancellation
        const revokeStatuses = ['refunded', 'cancelled', 'charged_back', 'chargedback']
        if (revokeStatuses.includes(status.toLowerCase())) {
          // Revoke entitlements
          await admin
            .from('user_entitlements')
            .update({
              status: 'revoked',
              valid_until: now.toISOString(),
              metadata: {
                mercadopago: {
                  kind: 'payment_revoked',
                  payment_id: dataId,
                  revoke_reason: status.toLowerCase(),
                  revoked_at: now.toISOString(),
                  raw: payment,
                },
              },
            })
            .eq('user_id', userId)
            .eq('provider', 'mercadopago')
            .in('status', ['active', 'trialing'])

          // Cancel subscriptions
          await admin
            .from('app_subscriptions')
            .update({
              status: 'cancelled',
              updated_at: now.toISOString(),
            })
            .eq('provider', 'mercadopago')
            .eq('user_id', userId)
            .in('status', ['active', 'past_due', 'pending'])
        }

        // VIP concedido (payment aprovado) ou revogado (refund/chargeback) → invalida o
        // cache do usuário pra refletir na hora (evita ficar FREE por até 30s pós-compra).
        await bustVipCaches(userId)
      }

      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ ok: true, ignored: true })
  } catch (e: unknown) {
    // Não vaza mensagem de erro interna ao caller (endpoint público). Loga server-side
    // e responde genérico. Auditoria 2026-06-28 (R2).
    logError('webhook:mercadopago', e)
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 })
  }
}
