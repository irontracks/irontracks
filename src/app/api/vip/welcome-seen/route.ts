import { NextResponse } from 'next/server'
import { requireUser, resolveRoleByUser } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'

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

export async function POST() {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase
    const user = auth.user

    const access = await computeVipAccess(supabase, user)
    if (!access.hasVip) {
      try {
        const admin = createAdminClient()
        await admin.from('audit_events').insert({
          actor_id: user.id,
          actor_email: user.email,
          actor_role: access.role,
          action: 'vip_welcome_seen_by_non_vip',
          entity_type: 'vip_welcome',
          entity_id: user.id,
          metadata: { userId: user.id, hasVip: false }
        })
      } catch {}
      return NextResponse.json({ ok: true, hasVip: false })
    }

    const nowIso = new Date().toISOString()
    const { error } = await supabase
      .from('vip_welcome_views')
      .upsert({ user_id: user.id, last_seen_at: nowIso }, { onConflict: 'user_id' })
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })

    return NextResponse.json({ ok: true, hasVip: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}
