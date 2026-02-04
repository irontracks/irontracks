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

export async function GET(req: Request) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response
  const supabase = auth.supabase
  const user = auth.user

  const access = await computeVipAccess(supabase, user)
  if (!access.hasVip) return NextResponse.json({ ok: false, error: 'vip_required' }, { status: 403 })

  try {
    const url = new URL(req.url)
    const threadId = String(url.searchParams.get('thread_id') || '').trim()
    if (!threadId) return NextResponse.json({ ok: false, error: 'missing_thread_id' }, { status: 400 })

    const limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit') || 60) || 60))

    const { data, error } = await supabase
      .from('vip_chat_messages')
      .select('id, thread_id, user_id, role, content, created_at')
      .eq('thread_id', threadId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(limit)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, messages: data || [] })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response
  const supabase = auth.supabase
  const user = auth.user

  const access = await computeVipAccess(supabase, user)
  if (!access.hasVip) return NextResponse.json({ ok: false, error: 'vip_required' }, { status: 403 })

  try {
    const body = await req.json().catch(() => ({}))
    const threadId = String(body?.thread_id || '').trim()
    const role = String(body?.role || '').trim()
    const content = String(body?.content || '').trim()
    if (!threadId || !role || !content) return NextResponse.json({ ok: false, error: 'missing_fields' }, { status: 400 })
    if (!['user', 'assistant', 'system'].includes(role)) return NextResponse.json({ ok: false, error: 'invalid_role' }, { status: 400 })

    const { data, error } = await supabase
      .from('vip_chat_messages')
      .insert({ thread_id: threadId, user_id: user.id, role, content })
      .select('id, thread_id, user_id, role, content, created_at')
      .single()
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, message: data })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}
