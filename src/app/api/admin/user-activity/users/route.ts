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
  search: z.string().max(100).optional(),
  role: z.enum(['admin', 'teacher', 'user']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
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

    const search = safeStr(q.search, 80)
    const role = q.role
    const limit = q.limit
    const offset = q.offset

    const admin = createAdminClient()

    let query = admin.from('profiles').select('id, display_name, photo_url, role, last_seen, email').order('last_seen', { ascending: false })
    if (search) {
      const like = `%${search}%`
      query = query.or(`display_name.ilike.${like},email.ilike.${like}`)
    }
    if (role) {
      query = query.eq('role', role)
    }

    const { data, error } = await query.range(offset, offset + limit - 1)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })

    const users = (Array.isArray(data) ? data : []).map((row) => {
      const p = row && typeof row === 'object' ? (row as Record<string, unknown>) : {}
      return {
        id: safeStr(p.id, 64),
        displayName: p.display_name != null ? String(p.display_name) : null,
        photoUrl: p.photo_url != null ? String(p.photo_url) : null,
        role: p.role != null ? String(p.role) : null,
        lastSeen: p.last_seen != null ? String(p.last_seen) : null,
        email: p.email != null ? String(p.email) : null,
      }
    })

    return NextResponse.json({ ok: true, users })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
