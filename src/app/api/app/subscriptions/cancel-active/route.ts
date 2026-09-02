import { NextResponse } from 'next/server'
import { respondInternalError } from '@/utils/api/internalError'
import { parseJsonBody } from '@/utils/zod'
import { z } from 'zod'
import { createClient } from '@/utils/supabase/server'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
// NEEDS ADMIN: RLS bypass required for cross-user data operations
import { createAdminClient } from '@/utils/supabase/admin'
import { mercadopagoRequest } from '@/lib/mercadopago'
import { respondDbError } from '@/utils/api/dbError'
import { logError } from '@/lib/logger'
import { cacheDelete } from '@/utils/cache'

export const dynamic = 'force-dynamic'

/**
 * Auditoria de cobranças 14/08/2026 (A7) — três correções:
 *  1. O cancelamento local só acontece DEPOIS de o provedor confirmar (ou de a
 *     consulta mostrar que já está cancelado lá). Antes, a falha era só logada
 *     e o app dizia "assinatura cancelada" enquanto o MP seguia cobrando.
 *  2. O período JÁ PAGO fica de pé: o entitlement não é revogado — o resolvedor
 *     corta sozinho quando valid_until passar. O cancelamento só garante que a
 *     janela é FINITA (valid_until NULL ganha o fim do período, ou agora).
 *  3. Escopo por assinatura: só os entitlements DESTA assinatura
 *     (provider + provider_subscription_id) são tocados — antes o cancelamento
 *     revogava todos os entitlements ativos do usuário, de qualquer provedor.
 */

const ZodBodySchema = z
  .object({
    planId: z.string().optional(),
  })
  .strip()

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const ip = getRequestIp(req)
    const rl = await checkRateLimitAsync(`subscriptions:cancel:${user.id}:${ip}`, 5, 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

    const parsedBody = await parseJsonBody(req, ZodBodySchema)
    if (parsedBody.response) return parsedBody.response
    const body = parsedBody.data!
    const planId = String(body?.planId || '').trim()

    const admin = createAdminClient()

    let q = admin
      .from('app_subscriptions')
      .select('id, user_id, plan_id, status, provider, provider_subscription_id, asaas_subscription_id, metadata, created_at')
      .eq('user_id', user.id)
      .in('status', ['active', 'past_due'])
      .order('created_at', { ascending: false })
      .limit(1)
    if (planId) q = q.eq('plan_id', planId)

    const { data: sub, error } = await q.maybeSingle()
    if (error) return respondDbError('subscriptions:cancel-active:lookup', error)
    if (!sub?.id) return NextResponse.json({ ok: true, cancelled: false })

    const provider = String(sub?.provider || '').trim()
    const providerSubId = String(sub?.provider_subscription_id || '').trim()
    // Asaas foi descontinuado (14/08/2026; código removido em 02/09/2026). A coluna
    // continua sendo a chave dos entitlements das assinaturas legadas — só não há
    // mais provedor para cancelar remotamente.
    const asaasSubId = String(sub?.asaas_subscription_id || '').trim()

    // Apple IAP (via RevenueCat) CANNOT be cancelled server-side by design —
    // Apple requires the user to cancel through iOS Settings → Apple ID →
    // Subscriptions. If we only updated our DB, the user's card would keep
    // being charged by Apple while the app tells them "assinatura cancelada".
    // Bail out early and ask the client to direct the user to iOS Settings.
    if (provider === 'apple' || provider === 'revenuecat' || provider === 'iap') {
      return NextResponse.json({
        ok: true,
        cancelled: false,
        apple_iap: true,
        message: 'Para cancelar esta assinatura, vá em Ajustes do iPhone → seu nome no topo → Assinaturas → IronTracks → Cancelar. O cancelamento pelo app não encerra a cobrança da Apple.',
      })
    }

    if (provider === 'mercadopago' && providerSubId) {
      try {
        await mercadopagoRequest({
          method: 'PUT',
          path: `/preapproval/${encodeURIComponent(providerSubId)}`,
          body: { status: 'cancelled' },
        })
      } catch (e) {
        // O PUT pode falhar porque a preapproval JÁ está cancelada lá — nesse
        // caso o estado local pode avançar. Qualquer outra situação aborta:
        // marcar cancelado local com o provedor ainda cobrando é o pior estado.
        const already = await mercadopagoRequest<{ status?: string }>({
          method: 'GET',
          path: `/preapproval/${encodeURIComponent(providerSubId)}`,
        }).then((p) => String(p?.status || '').toLowerCase() === 'cancelled').catch(() => false)
        if (!already) {
          logError('api:subscriptions:cancel-active:mercadopago', e)
          return NextResponse.json({ ok: false, error: 'provedor_falhou' }, { status: 502 })
        }
      }
    }


    {
      const { error: subUpdErr } = await admin
        .from('app_subscriptions')
        .update({
          status: 'cancelled',
          cancel_at_period_end: true,
          updated_at: new Date().toISOString(),
          metadata: {
            ...(sub?.metadata && typeof sub.metadata === 'object' ? sub.metadata : {}),
            cancellation: { at: new Date().toISOString(), by: 'user', reason: 'cancel_active_subscription' },
          },
        })
        .eq('id', sub.id)
      if (subUpdErr) return respondDbError('subscriptions:cancel-active:mark', subUpdErr)
    }

    // O período pago continua valendo: nada de status='cancelled' nem
    // valid_until=agora nos entitlements. Só se garante janela FINITA nos
    // entitlements DESTA assinatura — valid_until NULL viraria acesso eterno
    // depois de cancelar a cobrança.
    if (providerSubId || asaasSubId) {
      const entKey = providerSubId || asaasSubId
      const { data: ents, error: entReadErr } = await admin
        .from('user_entitlements')
        .select('id, valid_until, current_period_end')
        .eq('user_id', user.id)
        .eq('provider', provider)
        .eq('provider_subscription_id', entKey)
        .in('status', ['active', 'trialing', 'past_due'])
      if (entReadErr) {
        // Não-fatal: a cobrança externa já parou (provedor confirmou). Loga
        // para reconciliação — o pior caso é um valid_until NULL sobreviver.
        logError('api:subscriptions:cancel-active:ent-read', entReadErr)
      }
      for (const ent of ents ?? []) {
        if (ent.valid_until) continue // janela finita: expira sozinha
        const { error: entUpdErr } = await admin
          .from('user_entitlements')
          .update({
            valid_until: ent.current_period_end || new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', ent.id)
        if (entUpdErr) logError('api:subscriptions:cancel-active:ent-close', entUpdErr)
      }
    }

    // Sem isto o cache (vip:access TTL 30s / bootstrap) atrasaria em até 30s o
    // reflexo do cancelamento (cancel_at_period_end, janela fechada).
    await Promise.all([
      cacheDelete(`vip:access:${user.id}`).catch(() => {}),
      cacheDelete(`dashboard:bootstrap:${user.id}`).catch(() => {}),
    ])

    return NextResponse.json({ ok: true, cancelled: true, id: sub.id })
  } catch (e: unknown) {
    return respondInternalError('api:app:subscriptions:cancel-active', e)
  }
}
