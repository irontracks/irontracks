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
    const { data, error } = await supabase
      .from('vip_profile')
      .select('user_id, goal, equipment, constraints, preferences, updated_at')
      .eq('user_id', user.id)
      .maybeSingle()
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, profile: data || null })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response
  const supabase = auth.supabase
  const user = auth.user

  const access = await computeVipAccess(supabase, user)
  if (!access.hasVip) return NextResponse.json({ ok: false, error: 'vip_required' }, { status: 403 })

  try {
    const body = await req.json().catch(() => ({}))
    const goal = typeof body?.goal === 'string' ? body.goal.trim() : null
    const equipment = typeof body?.equipment === 'string' ? body.equipment.trim() : null
    const constraints = typeof body?.constraints === 'string' ? body.constraints.trim() : null
    const preferences = body?.preferences && typeof body.preferences === 'object' && !Array.isArray(body.preferences) ? body.preferences : {}

    const { data, error } = await supabase
      .from('vip_profile')
      .upsert(
        {
          user_id: user.id,
          goal: goal || null,
          equipment: equipment || null,
          constraints: constraints || null,
          preferences,
        },
        { onConflict: 'user_id' },
      )
      .select('user_id, goal, equipment, constraints, preferences, updated_at')
      .single()

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, profile: data })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}
