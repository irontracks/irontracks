import { NextResponse } from 'next/server'
import { requireUser } from '@/utils/auth/route'
import { getVipPlanLimits } from '@/utils/vip/limits'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase
    const user = auth.user

    const url = new URL(req.url)
    const limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit') || 200) || 200))

    const { limits, tier } = await getVipPlanLimits(supabase, user.id)

    const query = supabase
      .from('workouts')
      .select('id, name, user_id, date, created_at, completed_at, notes, is_template')
      .eq('user_id', user.id)
      .eq('is_template', false)
      .order('date', { ascending: false })
      .limit(limit)

    const historyDays = limits.history_days
    if (typeof historyDays === 'number' && Number.isFinite(historyDays) && historyDays > 0) {
      const cutoff = new Date(Date.now() - historyDays * 24 * 60 * 60 * 1000).toISOString()
      query.gte('date', cutoff)
    }

    const { data, error } = await query
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })

    return NextResponse.json({
      ok: true,
      tier,
      history_days: historyDays,
      rows: data || [],
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}
