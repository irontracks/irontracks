import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { requireRole, requireRoleWithBearer } from '@/utils/auth/route'

export const dynamic = 'force-dynamic'

const safeStr = (v: any, max = 200) => {
  const s = typeof v === 'string' ? v.trim() : String(v ?? '').trim()
  if (!s) return ''
  return s.length > max ? s.slice(0, max) : s
}

export async function GET(req: Request) {
  try {
    let auth = await requireRole(['admin'])
    if (!auth.ok) {
      auth = await requireRoleWithBearer(req, ['admin'])
      if (!auth.ok) return auth.response
    }

    const url = new URL(req.url)
    const q = safeStr(url.searchParams.get('q') || '', 80)
    const role = safeStr(url.searchParams.get('role') || '', 20).toLowerCase()
    const limit = Math.min(300, Math.max(1, Number(url.searchParams.get('limit') || 150) || 150))

    const admin = createAdminClient()

    let query = admin.from('profiles').select('id, display_name, photo_url, role, last_seen, email').order('last_seen', { ascending: false })
    if (q) {
      const like = `%${q}%`
      query = query.or(`display_name.ilike.${like},email.ilike.${like}`)
    }
    if (role === 'admin' || role === 'teacher' || role === 'user') {
      query = query.eq('role', role)
    }

    const { data, error } = await query.limit(limit)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })

    const users = (Array.isArray(data) ? data : []).map((p: any) => ({
      id: String(p?.id || '').trim(),
      displayName: p?.display_name != null ? String(p.display_name) : null,
      photoUrl: p?.photo_url != null ? String(p.photo_url) : null,
      role: p?.role != null ? String(p.role) : null,
      lastSeen: p?.last_seen != null ? String(p.last_seen) : null,
      email: p?.email != null ? String(p.email) : null,
    }))

    return NextResponse.json({ ok: true, users })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}
