import { NextResponse } from 'next/server'
import { requireUser } from '@/utils/auth/route'
import { createClient } from '@/utils/supabase/server'
import { checkVipFeatureAccess, getVipPlanLimits } from '@/utils/vip/limits'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase
    const userId = auth.user.id

    // Get Plan Limits
    const { tier, limits, source, debug } = await getVipPlanLimits(supabase, userId)

    // Get Usage
    const chatUsage = await checkVipFeatureAccess(supabase, userId, 'chat_daily')
    const wizardUsage = await checkVipFeatureAccess(supabase, userId, 'wizard_weekly')

    return NextResponse.json({
      ok: true,
      tier,
      source,
      debug: debug || null,
      limits,
      usage: {
        chat_daily: chatUsage.currentUsage,
        wizard_weekly: wizardUsage.currentUsage
      }
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
