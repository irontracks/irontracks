import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getErrorMessage } from '@/utils/errorMessage'
import { cacheGet, cacheSet } from '@/utils/cache'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const cacheKey = `workouts:list:${user.id}`
    const cached = await cacheGet<Record<string, unknown>>(cacheKey, (v) => (v && typeof v === 'object' ? (v as Record<string, unknown>) : null))
    if (cached) return NextResponse.json(cached)

    const query = supabase
      .from('workouts')
      .select('id, name, user_id')
      .eq('user_id', user.id)
      .order('name')

    const { data, error } = await query
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })

    interface WorkoutRow {
      id: string
      name: string
      user_id: string
    }
    const rows: WorkoutRow[] = (data || []) as unknown as WorkoutRow[]
    const payload = { ok: true, rows }
    await cacheSet(cacheKey, payload, 60)
    return NextResponse.json(payload)
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}
