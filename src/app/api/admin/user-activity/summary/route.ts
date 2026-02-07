import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { requireRole } from '@/utils/auth/route'

export const dynamic = 'force-dynamic'

const safeStr = (v: any, max = 200) => {
  const s = typeof v === 'string' ? v.trim() : String(v ?? '').trim()
  if (!s) return ''
  return s.length > max ? s.slice(0, max) : s
}

export async function GET(req: Request) {
  try {
    const auth = await requireRole(['admin'])
    if (!auth.ok) return auth.response

    const url = new URL(req.url)
    const userId = safeStr(url.searchParams.get('user_id') || '', 64)
    if (!userId) return NextResponse.json({ ok: false, error: 'user_id required' }, { status: 400 })

    const daysRaw = Number(url.searchParams.get('days') || 7) || 7
    const days = Math.min(90, Math.max(1, Math.round(daysRaw)))
    const fromIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('user_activity_events')
      .select('event_name, event_type')
      .eq('user_id', userId)
      .gte('created_at', fromIso)
      .order('created_at', { ascending: false })
      .limit(2000)

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })

    const rows = Array.isArray(data) ? data : []
    const byName = new Map<string, number>()
    const byType = new Map<string, number>()

    for (const r of rows) {
      const name = safeStr((r as any)?.event_name || '', 120)
      const type = safeStr((r as any)?.event_type || '', 80)
      if (name) byName.set(name, (byName.get(name) || 0) + 1)
      if (type) byType.set(type, (byType.get(type) || 0) + 1)
    }

    const topEvents = Array.from(byName.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 30)

    const topTypes = Array.from(byType.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20)

    return NextResponse.json({ ok: true, days, total: rows.length, topEvents, topTypes })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}

