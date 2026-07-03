import { NextResponse } from 'next/server'
import { requireUser } from '@/utils/auth/route'
import { checkVipFeatureAccess, getVipPlanLimits } from '@/utils/vip/limits'
import { cacheGet, cacheSet } from '@/utils/cache'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase
    const userId = auth.user.id

    const cacheKey = `vip:status:${userId}`
    const cached = await cacheGet<Record<string, unknown>>(cacheKey, (v) => (v && typeof v === 'object' ? (v as Record<string, unknown>) : null))
    if (cached) return NextResponse.json(cached)

    // Resolve o plano UMA vez e injeta nas checagens (antes: 3 resoluções completas por
    // request — 1 direta + 1 dentro de cada checkVipFeatureAccess). As 2 leituras de
    // usage são read-only (sem meter) e independentes → paralelas.
    const plan = await getVipPlanLimits(supabase, userId)
    const { tier, limits, source, debug } = plan
    const [chatUsage, wizardUsage] = await Promise.all([
      checkVipFeatureAccess(supabase, userId, 'chat_daily', { plan }),
      checkVipFeatureAccess(supabase, userId, 'wizard_weekly', { plan }),
    ])

    const payload = {
      ok: true,
      tier,
      source,
      ...(process.env.NODE_ENV === 'development' ? { debug: debug || null } : {}),
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
