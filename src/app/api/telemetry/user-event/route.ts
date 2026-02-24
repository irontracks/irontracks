import { NextResponse } from 'next/server'
import { parseJsonBody } from '@/utils/zod'
import { z } from 'zod'
import { createAdminClient } from '@/utils/supabase/admin'
import { createClient } from '@/utils/supabase/server'
import { getErrorMessage } from '@/utils/errorMessage'

export const dynamic = 'force-dynamic'

const IncomingEventSchema = z
  .object({
    name: z.unknown().optional(),
    type: z.unknown().optional(),
    screen: z.unknown().optional(),
    path: z.unknown().optional(),
    metadata: z.unknown().optional(),
    clientTs: z.unknown().optional(),
    appVersion: z.unknown().optional(),
  })
  .strip()

const ZodBodySchema = z.union([
  z.object({ events: z.array(IncomingEventSchema).max(50) }).strip(),
  z.array(IncomingEventSchema).max(50),
  IncomingEventSchema,
])

type IncomingEvent = {
  name?: unknown
  type?: unknown
  screen?: unknown
  path?: unknown
  metadata?: unknown
  clientTs?: unknown
  appVersion?: unknown
}

const safeStr = (v: unknown, max = 200) => {
  const s = typeof v === 'string' ? v.trim() : String(v ?? '').trim()
  if (!s) return ''
  return s.length > max ? s.slice(0, max) : s
}

const safeJson = (v: unknown) => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
  return v as Record<string, unknown>
}

const safeTs = (v: unknown) => {
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

export async function POST(req: Request) {
  try {
    const parsedBody = await parseJsonBody(req, ZodBodySchema)
    if (parsedBody.response) return parsedBody.response
    const body = parsedBody.data!
    const rawFromBody = (body as Record<string, unknown>)?.events
    const rawEvents = Array.isArray(rawFromBody) ? (rawFromBody as unknown[]) : body ? [body] : []
    const events: IncomingEvent[] = rawEvents.filter(Boolean).slice(0, 50) as IncomingEvent[]

    if (!events.length) return NextResponse.json({ ok: true, inserted: 0 })

    const supabase = await createClient()
    const { data: authData } = await supabase.auth.getUser()
    const user = authData?.user
    if (!user?.id) return NextResponse.json({ ok: true, inserted: 0 })

    const admin = createAdminClient()
    const uid = user.id

    let displayName: string | null = null
    let role: string | null = null
    try {
      const { data: p } = await admin.from('profiles').select('display_name, role').eq('id', uid).maybeSingle()
      displayName = p?.display_name != null ? String(p.display_name) : null
      role = p?.role != null ? String(p.role) : null
    } catch {}

    const ua = safeStr(req.headers.get('user-agent') || '', 400)

    const rows = events
      .map((e) => {
        const name = safeStr(e?.name, 80)
        if (!name) return null
        return {
          user_id: uid,
          role: role,
          display_name: displayName,
          event_name: name,
          event_type: safeStr(e?.type, 40) || null,
          screen: safeStr(e?.screen, 120) || null,
          path: safeStr(e?.path, 300) || null,
          metadata: safeJson(e?.metadata),
          client_ts: safeTs(e?.clientTs),
          user_agent: ua || null,
          app_version: safeStr(e?.appVersion, 80) || null,
        }
      })
      .filter(Boolean) as unknown[]

    if (!rows.length) return NextResponse.json({ ok: true, inserted: 0 })

    const { error } = await admin.from('user_activity_events').insert(rows)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })

    return NextResponse.json({ ok: true, inserted: rows.length })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}
