import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/utils/supabase/admin'
import { requireRole, requireRoleWithBearer } from '@/utils/auth/route'
import { parseSearchParams } from '@/utils/zod'

export const dynamic = 'force-dynamic'

const safeStr = (v: unknown, max = 200): string => {
  const s = typeof v === 'string' ? v.trim() : String(v ?? '').trim()
  if (!s) return ''
  return s.length > max ? s.slice(0, max) : s
}

const QuerySchema = z.object({
  user_id: z.string().uuid().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
})

export async function GET(req: Request) {
  try {
    let auth = await requireRole(['admin'])
    if (!auth.ok) {
      auth = await requireRoleWithBearer(req, ['admin'])
      if (!auth.ok) return auth.response
    }

    const { data: q, response } = parseSearchParams(req, QuerySchema)
    if (response) return response
    if (!q) return NextResponse.json({ ok: false, error: 'invalid_query' }, { status: 400 })

    const userId = safeStr(q.user_id, 64)
    if (!userId) return NextResponse.json({ ok: false, error: 'user_id required' }, { status: 400 })

    const fromIso = q.from && typeof q.from === 'string' && q.from.trim() ? q.from : null
    const toIso = q.to && typeof q.to === 'string' && q.to.trim() ? q.to : null

    const now = Date.now()
    const defaultFrom = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString()
    const from = fromIso || defaultFrom
    const to = toIso || new Date().toISOString()

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('user_activity_events')
      .select('event_name, event_type')
      .eq('user_id', userId)
      .gte('created_at', from)
      .lte('created_at', to)
      .order('created_at', { ascending: false })
      .limit(2000)

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })

    const rows = Array.isArray(data) ? data : []
    const byName = new Map<string, number>()
    const byType = new Map<string, number>()

    for (const r of rows) {
      const name = safeStr((r as Record<string, unknown>)?.event_name || '', 120)
      const type = safeStr((r as Record<string, unknown>)?.event_type || '', 80)
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

    const msRange = new Date(to).getTime() - new Date(from).getTime()
    const days = Math.max(1, Math.round(msRange / (24 * 60 * 60 * 1000)))

    return NextResponse.json({ ok: true, days, total: rows.length, topEvents, topTypes })
  } catch (e: any) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
