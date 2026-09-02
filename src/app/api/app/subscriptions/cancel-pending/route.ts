import { NextResponse } from 'next/server'
import { respondInternalError } from '@/utils/api/internalError'
import { z } from 'zod'
import { createClient } from '@/utils/supabase/server'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
// NEEDS ADMIN: RLS bypass required for cross-user data operations
import { createAdminClient } from '@/utils/supabase/admin'
import { mercadopagoRequest } from '@/lib/mercadopago'
import { parseJsonBody } from '@/utils/zod'
import { respondDbError } from '@/utils/api/dbError'
import { logError } from '@/lib/logger'

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
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
    if (planId) q = q.eq('plan_id', planId)

    const { data: sub, error } = await q.maybeSingle()
    if (error) return respondDbError('subscriptions:cancel-pending:lookup', error)
    if (!sub?.id) return NextResponse.json({ ok: true, cancelled: false })

    const provider = String(sub?.provider || '').trim()
    const providerSubId = String(sub?.provider_subscription_id || '').trim()

    // A7 (auditoria 14/08/2026): o cancelamento local só acontece DEPOIS de o
    // provedor confirmar (ou de a consulta mostrar que já está cancelado lá).
    // Antes a falha era só logada e o registro local virava 'cancelled' com a
    // preapproval ainda VIVA no provedor — o usuário podia autorizar depois e
    // ser cobrado por uma assinatura que o app diz não existir.
    if (provider === 'mercadopago' && providerSubId) {
      try {
        await mercadopagoRequest({
          method: 'PUT',
          path: `/preapproval/${encodeURIComponent(providerSubId)}`,
          body: { status: 'cancelled' },
        })
      } catch (e) {
        const already = await mercadopagoRequest<{ status?: string }>({
          method: 'GET',
          path: `/preapproval/${encodeURIComponent(providerSubId)}`,
        }).then((p) => String(p?.status || '').toLowerCase() === 'cancelled').catch(() => false)
        if (!already) {
          logError('api:subscriptions:cancel-pending:mercadopago', e)
          return NextResponse.json({ ok: false, error: 'provedor_falhou' }, { status: 502 })
        }
      }
    }


    const { error: subUpdErr } = await admin
      .from('app_subscriptions')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
        metadata: {
          ...(sub?.metadata && typeof sub.metadata === 'object' ? sub.metadata : {}),
          cancellation: { at: new Date().toISOString(), by: 'user', reason: 'cancel_pending_attempt' },
        },
      })
      .eq('id', sub.id)
    if (subUpdErr) return respondDbError('subscriptions:cancel-pending:mark', subUpdErr)

    return NextResponse.json({ ok: true, cancelled: true, id: sub.id })
  } catch (e: unknown) {
    return respondInternalError('api:app:subscriptions:cancel-pending', e)
  }
}
