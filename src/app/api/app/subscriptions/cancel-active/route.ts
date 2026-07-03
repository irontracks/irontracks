import { NextResponse } from 'next/server'
import { parseJsonBody } from '@/utils/zod'
import { z } from 'zod'
import { createClient } from '@/utils/supabase/server'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
// NEEDS ADMIN: RLS bypass required for cross-user data operations
import { createAdminClient } from '@/utils/supabase/admin'
import { asaasRequest } from '@/lib/asaas'
import { mercadopagoRequest } from '@/lib/mercadopago'
import { getErrorMessage } from '@/utils/errorMessage'
import { respondDbError } from '@/utils/api/dbError'
import { logError } from '@/lib/logger'
import { cacheDelete } from '@/utils/cache'

export const dynamic = 'force-dynamic'

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
      } catch (e) { logError('api:subscriptions:cancel-active:mercadopago', e) }
    }

    if (provider === 'asaas' && (providerSubId || asaasSubId)) {
      const target = providerSubId || asaasSubId
      try {
        await asaasRequest({
          method: 'PUT',
          path: `/subscriptions/${encodeURIComponent(target)}`,
          body: { status: 'INACTIVE' },
        })
      } catch (e) { logError('api:subscriptions:cancel-active:asaas', e) }
    }

    await admin
      .from('app_subscriptions')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
        metadata: {
          ...(sub?.metadata && typeof sub.metadata === 'object' ? sub.metadata : {}),
          cancellation: { at: new Date().toISOString(), by: 'user', reason: 'cancel_active_subscription' },
        },
      })
      .eq('id', sub.id)

    // R2#7: Also revoke user_entitlements so VIP access is removed immediately
    // Without this, the user retains VIP until valid_until expires naturally
    try {
      await admin
        .from('user_entitlements')
        .update({ status: 'cancelled', valid_until: new Date().toISOString() })
        .eq('user_id', user.id)
        .in('status', ['active', 'trialing', 'past_due'])
    } catch (e) { logError('api:subscriptions:cancel-active:revoke-entitlements', e) }

    // Sem isto o cache (vip:access TTL 30s / bootstrap) manteria o VIP "ativo" por até
    // 30s após o cancelamento — contradizendo o "removed immediately" acima.
    await Promise.all([
      cacheDelete(`vip:access:${user.id}`).catch(() => {}),
      cacheDelete(`dashboard:bootstrap:${user.id}`).catch(() => {}),
    ])

    return NextResponse.json({ ok: true, cancelled: true, id: sub.id })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}
