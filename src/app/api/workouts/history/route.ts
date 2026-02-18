import { NextResponse } from 'next/server'
import { z } from 'zod'
import { parseSearchParams } from '@/utils/zod'
import { createClient } from '@/utils/supabase/server'
import { getVipPlanLimits } from '@/utils/vip/limits'

export const dynamic = 'force-dynamic'

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(20),
})

export async function GET(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const { data: q, response } = parseSearchParams(req, QuerySchema)
    if (response) return response
    if (!q) return NextResponse.json({ ok: false, error: 'invalid_query' }, { status: 400 })

    const { limits, tier } = await getVipPlanLimits(supabase, user.id)

    let query = supabase
      .from('workouts')
      .select('id, name, user_id, date, created_at, completed_at, notes, is_template')
      .eq('user_id', user.id)
      .eq('is_template', false)
      .order('date', { ascending: false })
      .limit(q.limit)

    const historyDays = limits.history_days
    if (typeof historyDays === 'number' && Number.isFinite(historyDays) && historyDays > 0) {
      const cutoff = new Date(Date.now() - historyDays * 24 * 60 * 60 * 1000).toISOString()
      query = query.gte('date', cutoff)
    }

    const { data, error } = await query
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })

    return NextResponse.json({
      ok: true,
      tier,
      history_days: historyDays,
      rows: data || [],
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
