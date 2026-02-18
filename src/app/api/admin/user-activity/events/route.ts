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

const safeIso = (v: unknown): string | null => {
  try {
    if (!v) return null
    const s = String(v).trim()
    if (!s) return null
    const d = new Date(s)
    const t = d.getTime()
    if (!Number.isFinite(t)) return null
    return d.toISOString()
  } catch {
    return null
  }
}

const QuerySchema = z.object({
  user_id: z.string().uuid('user_id inválido').optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  before: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
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

    const userId = safeStr(q.user_id, 64)
    if (!userId) return NextResponse.json({ ok: false, error: 'user_id required' }, { status: 400 })

    const from = safeIso(q.from)
    const to = safeIso(q.to)
    const before = safeIso(q.before)
    const limit = q.limit

    const admin = createAdminClient()

    let query = admin
      .from('user_activity_events')
      .select('id, created_at, user_id, role, display_name, event_name, event_type, screen, path, metadata, client_ts, user_agent, app_version')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (from) query = query.gte('created_at', from)
    if (to) query = query.lte('created_at', to)
    if (before) query = query.lt('created_at', before)

    const { data, error } = await query
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })

    const rows = Array.isArray(data) ? data : []
    const events = rows.map((row) => {
      const r = row && typeof row === 'object' ? (row as Record<string, unknown>) : {}
      const metadata = r.metadata && typeof r.metadata === 'object' ? (r.metadata as Record<string, unknown>) : {}
      return {
        id: safeStr(r.id, 64),
        createdAt: r.created_at != null ? String(r.created_at) : null,
        userId: safeStr(r.user_id, 64),
        role: r.role != null ? String(r.role) : null,
        displayName: r.display_name != null ? String(r.display_name) : null,
        name: r.event_name != null ? String(r.event_name) : null,
        type: r.event_type != null ? String(r.event_type) : null,
        screen: r.screen != null ? String(r.screen) : null,
        path: r.path != null ? String(r.path) : null,
        metadata,
        clientTs: r.client_ts != null ? String(r.client_ts) : null,
        userAgent: r.user_agent != null ? String(r.user_agent) : null,
        appVersion: r.app_version != null ? String(r.app_version) : null,
      }
    })

    const nextBefore = events.length ? events[events.length - 1]?.createdAt : null
    return NextResponse.json({ ok: true, events, nextBefore })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
