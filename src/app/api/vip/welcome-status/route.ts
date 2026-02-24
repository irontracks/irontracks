import { NextResponse } from 'next/server'
import { requireUser } from '@/utils/auth/route'
import { getVipPlanLimits } from '@/utils/vip/limits'
import { cacheGet, cacheSet } from '@/utils/cache'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase
    const user = auth.user

    const entitlement = await getVipPlanLimits(supabase, user.id)
    if (entitlement.tier === 'free') {
      return NextResponse.json({ ok: true, hasVip: false, alreadySeen: false, shouldShow: false })
    }

    const cacheKey = `vip:welcome-status:${user.id}`
    const cached = await cacheGet<Record<string, unknown>>(cacheKey, (v) => (v && typeof v === 'object' ? (v as Record<string, unknown>) : null))
    if (cached) return NextResponse.json(cached)

    const { data, error } = await supabase
      .from('vip_welcome_views')
      .select('user_id, first_seen_at, last_seen_at')
      .eq('user_id', user.id)
      .maybeSingle()
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })

    const alreadySeen = !!data?.user_id
    const payload = { ok: true, hasVip: true, alreadySeen, shouldShow: !alreadySeen }
    await cacheSet(cacheKey, payload, 60)
    return NextResponse.json(payload)
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
