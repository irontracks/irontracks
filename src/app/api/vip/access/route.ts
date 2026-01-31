import { NextResponse } from 'next/server'
import { requireUser, resolveRoleByUser } from '@/utils/auth/route'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireUser()
  if (!auth.ok) return auth.response
  const supabase = auth.supabase
  const user = auth.user

  try {
    const { role } = await resolveRoleByUser({ id: user?.id, email: user?.email })
    if (role === 'admin' || role === 'teacher') {
      return NextResponse.json({ ok: true, hasVip: true, role })
    }

    const { data: appSub } = await supabase
      .from('app_subscriptions')
      .select('id, status')
      .eq('user_id', user.id)
      .in('status', ['active', 'past_due'])
      .limit(1)
    if (Array.isArray(appSub) && appSub.length > 0) {
      return NextResponse.json({ ok: true, hasVip: true, role })
    }

    const { data } = await supabase
      .from('marketplace_subscriptions')
      .select('id, status')
      .eq('student_user_id', user.id)
      .in('status', ['active', 'past_due'])
      .limit(1)

    const hasVip = Array.isArray(data) && data.length > 0
    return NextResponse.json({ ok: true, hasVip, role })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}
