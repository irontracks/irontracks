import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { cacheGet, cacheSet } from '@/utils/cache'
import { respondDbError } from '@/utils/api/dbError'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const cacheKey = `diagnostics:workouts:${user.id}`
    const cached = await cacheGet<Record<string, unknown>>(cacheKey, (v) => (v && typeof v === 'object' ? (v as Record<string, unknown>) : null))
    if (cached) return NextResponse.json(cached)

    const { data, error } = await supabase
      .from('workouts')
      .select('id, user_id, name, date, created_at, is_template, notes')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10)

    if (error) return respondDbError('diagnostics:workouts', error)
    const payload = { ok: true, rows: data }
    await cacheSet(cacheKey, payload, 60)
    return NextResponse.json(payload)
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: (e as { message?: string })?.message ?? String(e) }, { status: 500 })
  }
}
