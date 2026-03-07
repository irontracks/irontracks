import { NextResponse } from 'next/server'
import { requireUser } from '@/utils/auth/route'
import { getVipPlanLimits } from '@/utils/vip/limits'
import { createAdminClient } from '@/utils/supabase/admin'
import { computeWeeklyStatsFromSessions } from '@/utils/vip/periodization'
import { getErrorMessage } from '@/utils/errorMessage'
import { cacheGet, cacheSet } from '@/utils/cache'

export const dynamic = 'force-dynamic'

const daysAgoIso = (days: number) => {
  const d = new Date()
  d.setDate(d.getDate() - Math.max(0, Math.floor(days)))
  return d.toISOString()
}

export async function GET() {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response

    const userId = String(auth.user.id || '').trim()
    const limits = await getVipPlanLimits(auth.supabase, userId)
    if (limits.tier === 'free') {
      return NextResponse.json({ ok: false, error: 'vip_required' }, { status: 403 })
    }

    const cacheKey = `vip:periodization:stats:${userId}`
    const cached = await cacheGet<Record<string, unknown>>(cacheKey, (v) => (v && typeof v === 'object' ? (v as Record<string, unknown>) : null))
    if (cached) return NextResponse.json(cached)

    const admin = createAdminClient()
    const since = daysAgoIso(7 * 14)

    const { data, error } = await admin
      .from('workouts')
      .select('created_at, notes')
      .eq('user_id', userId)
      .eq('is_template', false)
      .gte('created_at', since)
      .order('created_at', { ascending: true })
      .limit(300)

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })

    const sessions = (Array.isArray(data) ? data : []).map((r: Record<string, unknown>) => ({
      created_at: String(r?.created_at || ''),
      notes: r?.notes ?? null,
    }))

    const weekly = computeWeeklyStatsFromSessions(sessions)

    const payload = { ok: true, weekly }
    await cacheSet(cacheKey, payload, 120)
    return NextResponse.json(payload)
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}
