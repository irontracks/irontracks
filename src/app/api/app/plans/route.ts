import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getErrorMessage } from '@/utils/errorMessage'
import { cacheGet, cacheSet } from '@/utils/cache'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const cacheKey = 'app:plans:active'
    const cached = await cacheGet<Record<string, unknown>>(cacheKey, (v) => (v && typeof v === 'object' ? (v as Record<string, unknown>) : null))
    if (cached) return NextResponse.json(cached)

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('app_plans')
      .select('id, name, description, interval, price_cents, currency, status, sort_order, features')
      .eq('status', 'active')
      .order('sort_order', { ascending: true })

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
    const payload = { ok: true, plans: data || [] }
    await cacheSet(cacheKey, payload, 120)
    return NextResponse.json(payload)
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) ?? String(e) }, { status: 500 })
  }
}
