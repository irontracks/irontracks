import { NextResponse } from 'next/server'
import { requireUser } from '@/utils/auth/route'
import { createClient } from '@/utils/supabase/server'
import { checkVipFeatureAccess, getVipPlanLimits } from '@/utils/vip/limits'
import { cacheGet, cacheSet } from '@/utils/cache'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase
    const userId = auth.user.id

    const cacheKey = `vip:status:${userId}`
    const cached = await cacheGet<Record<string, unknown>>(cacheKey, (v) => (v && typeof v === 'object' ? (v as Record<string, unknown>) : null))
    if (cached) return NextResponse.json(cached)

    // Get Plan Limits
    const { tier, limits, source, debug } = await getVipPlanLimits(supabase, userId)

    // Get Usage
    const chatUsage = await checkVipFeatureAccess(supabase, userId, 'chat_daily')
    const wizardUsage = await checkVipFeatureAccess(supabase, userId, 'wizard_weekly')

    const payload = {
      ok: true,
      tier,
      source,
      debug: debug || null,
      limits,
      usage: {
        chat_daily: chatUsage.currentUsage,
        wizard_weekly: wizardUsage.currentUsage
      }
    }

    await cacheSet(cacheKey, payload, 30)

    return NextResponse.json(payload)
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
