import { NextResponse } from 'next/server'
import { requireUser, resolveRoleByUser } from '@/utils/auth/route'
import { getVipPlanLimits } from '@/utils/vip/limits'
import { cacheGet, cacheSet } from '@/utils/cache'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireUser()
  if (!auth.ok) return auth.response
  const supabase = auth.supabase
  const user = auth.user

  try {
    const cacheKey = `vip:access:${user.id}`
    const cached = await cacheGet<Record<string, unknown>>(cacheKey, (v) => (v && typeof v === 'object' ? (v as Record<string, unknown>) : null))
    if (cached) return NextResponse.json(cached)

    const { role } = await resolveRoleByUser({ id: user?.id, email: user?.email })
    const entitlement = await getVipPlanLimits(supabase, user.id)
    const hasVip = entitlement.tier !== 'free'
    const payload = { ok: true, hasVip, role, entitlement }
    // TTL 300s (era 30s): consistente com o dashboard:bootstrap e o cacheWarmup, que já
    // usam 300. Seguro porque TODOS os paths que mudam o VIP invalidam vip:access —
    // webhooks RevenueCat/Asaas/MercadoPago, sync IAP, grant/revoke admin e cancel-active
    // (gaps fechados no PA6). Expiração dispara EXPIRATION webhook (que invalida), então a
    // janela de VIP pós-expiração fica limitada à entrega do webhook, não ao TTL.
    await cacheSet(cacheKey, payload, 300)
    return NextResponse.json(payload)
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
