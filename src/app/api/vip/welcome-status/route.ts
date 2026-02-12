import { NextResponse } from 'next/server'
import { requireUser, resolveRoleByUser } from '@/utils/auth/route'

export const dynamic = 'force-dynamic'

const computeVipAccess = async (supabase: any, user: any) => {
  const { role } = await resolveRoleByUser({ id: user?.id, email: user?.email })
  if (role === 'admin' || role === 'teacher') return { ok: true as const, role, hasVip: true }
  try {
    const { data: appSub } = await supabase
      .from('app_subscriptions')
      .select('id, status')
      .eq('user_id', user.id)
      .in('status', ['active', 'past_due'])
      .limit(1)
    if (Array.isArray(appSub) && appSub.length > 0) {
      return { ok: true as const, role, hasVip: true }
    }

    const { data } = await supabase
      .from('marketplace_subscriptions')
      .select('id, status')
      .eq('student_user_id', user.id)
      .in('status', ['active', 'past_due'])
      .limit(1)
    const hasVip = Array.isArray(data) && data.length > 0
    return { ok: true as const, role, hasVip }
  } catch {
    return { ok: true as const, role, hasVip: false }
  }
}

export async function GET() {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase
    const user = auth.user

    const access = await computeVipAccess(supabase, user)
    if (!access.hasVip) {
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
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}
