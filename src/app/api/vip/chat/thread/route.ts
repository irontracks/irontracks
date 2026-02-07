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
  const auth = await requireUser()
  if (!auth.ok) return auth.response
  const supabase = auth.supabase
  const user = auth.user

  const access = await computeVipAccess(supabase, user)
  if (!access.hasVip) return NextResponse.json({ ok: false, error: 'vip_required' }, { status: 403 })

  try {
    const { data: existing } = await supabase
      .from('vip_chat_threads')
      .select('id, user_id, created_at, updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existing?.id) return NextResponse.json({ ok: true, thread: existing })

    const { data, error } = await supabase
      .from('vip_chat_threads')
      .insert({ user_id: user.id })
      .select('id, user_id, created_at, updated_at')
      .single()
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, thread: data })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}
