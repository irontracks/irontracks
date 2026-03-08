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
    await cacheSet(cacheKey, payload, 30)
    return NextResponse.json(payload)
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
