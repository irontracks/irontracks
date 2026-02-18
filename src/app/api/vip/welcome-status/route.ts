import { NextResponse } from 'next/server'
import { requireUser } from '@/utils/auth/route'
import { getVipPlanLimits } from '@/utils/vip/limits'

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

    const { data, error } = await supabase
      .from('vip_welcome_views')
      .select('user_id, first_seen_at, last_seen_at')
      .eq('user_id', user.id)
      .maybeSingle()
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })

    const alreadySeen = !!data?.user_id
    return NextResponse.json({ ok: true, hasVip: true, alreadySeen, shouldShow: !alreadySeen })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
