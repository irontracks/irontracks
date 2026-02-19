import { NextResponse } from 'next/server'
import { requireUser } from '@/utils/auth/route'
import { getVipPlanLimits } from '@/utils/vip/limits'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireUser()
  if (!auth.ok) return auth.response
  const supabase = auth.supabase
  const user = auth.user

  const entitlement = await getVipPlanLimits(supabase, user.id)
  if (entitlement.tier === 'free') return NextResponse.json({ ok: false, error: 'vip_required' }, { status: 403 })

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
    return NextResponse.json({ ok: false, error: (e as any)?.message ?? String(e) }, { status: 500 })
  }
}
