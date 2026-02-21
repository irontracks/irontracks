import { NextResponse } from 'next/server'
import { requireUser } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'
import { getVipPlanLimits } from '@/utils/vip/limits'
import { getErrorMessage } from '@/utils/errorMessage'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase
    const user = auth.user

    const entitlement = await getVipPlanLimits(supabase, user.id)
    if (entitlement.tier === 'free') {
      try {
        const admin = createAdminClient()
        await admin.from('audit_events').insert({
          actor_id: user.id,
          actor_email: user.email,
          actor_role: 'user',
          action: 'vip_welcome_seen_by_non_vip',
          entity_type: 'vip_welcome',
          entity_id: user.id,
          metadata: { userId: user.id, hasVip: false },
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
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}
