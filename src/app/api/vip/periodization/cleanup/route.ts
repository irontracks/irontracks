import { NextResponse } from 'next/server'
import { requireUser } from '@/utils/auth/route'
import { checkVipFeatureAccess, getVipPlanLimits } from '@/utils/vip/limits'
import { createAdminClient } from '@/utils/supabase/admin'
import { getErrorMessage } from '@/utils/errorMessage'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response

    const userId = String(auth.user.id || '').trim()
    const access = await checkVipFeatureAccess(auth.supabase, userId, 'wizard_weekly')
    if (!access.allowed) {
      return NextResponse.json({ ok: false, error: 'vip_required', upgradeRequired: true }, { status: 403 })
    }

    const admin = createAdminClient()

    const { data: program } = await admin
      .from('vip_periodization_programs')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const keepIds = new Set<string>()
    if (program?.id) {
      const { data: links } = await admin
        .from('vip_periodization_workouts')
        .select('workout_id')
        .eq('user_id', userId)
        .eq('program_id', String(program.id))
        .limit(500)
      ;(Array.isArray(links) ? links : []).forEach((r: Record<string, unknown>) => {
        const id = String(r?.workout_id || '').trim()
        if (id) keepIds.add(id)
      })
    }

    const { data: vipTemplates } = await admin
      .from('workouts')
      .select('id')
      .eq('user_id', userId)
      .eq('is_template', true)
      .ilike('name', 'VIP •%')
      .is('archived_at', null)
      .limit(2000)

    const idsToArchive = (Array.isArray(vipTemplates) ? vipTemplates : [])
      .map((r: Record<string, unknown>) => String(r?.id || '').trim())
      .filter((id) => id && !keepIds.has(id))

    if (!idsToArchive.length) return NextResponse.json({ ok: true, archived: 0 })

    const { error } = await admin.from('workouts').update({ archived_at: new Date().toISOString() }).in('id', idsToArchive)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })

    return NextResponse.json({ ok: true, archived: idsToArchive.length })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}
