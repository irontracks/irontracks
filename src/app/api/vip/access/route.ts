import { NextResponse } from 'next/server'
import { requireUser, resolveRoleByUser } from '@/utils/auth/route'
import { getVipPlanLimits } from '@/utils/vip/limits'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireUser()
  if (!auth.ok) return auth.response
  const supabase = auth.supabase
  const user = auth.user

  try {
    const { role } = await resolveRoleByUser({ id: user?.id, email: user?.email })
    const entitlement = await getVipPlanLimits(supabase, user.id)
    const hasVip = entitlement.tier !== 'free'
    return NextResponse.json({ ok: true, hasVip, role, entitlement })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}
