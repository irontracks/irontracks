import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { jsonError, requireRole, resolveRoleByUser } from '@/utils/auth/route'
import { z } from 'zod'
import { parseSearchParams } from '@/utils/zod'
import { cacheGet, cacheSet } from '@/utils/cache'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'

export const dynamic = 'force-dynamic'

const QuerySchema = z.object({
  teacher_id: z.string().uuid().optional(),
  status: z.enum(['active', 'inactive', 'all']).default('all'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

export async function GET(req: Request) {
  try {
    const admin = createAdminClient()
    const auth = await requireRole(['admin'])
    if (!auth.ok) {
      const token = String(req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
      if (!token) return auth.response
      const { data, error } = await admin.auth.getUser(token)
      const user = data?.user ?? null
      if (error || !user?.id) return auth.response
      const { role } = await resolveRoleByUser({ id: user.id, email: user.email })
      if (role !== 'admin') return jsonError(403, 'forbidden')
    }

    const ip = getRequestIp(req)
    const rlKey = `admin:students:list:${auth.ok ? auth.user.id : 'anon'}:${ip}`
    const rl = await checkRateLimitAsync(rlKey, 30, 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

    const { data: q, response } = parseSearchParams(req, QuerySchema)
    if (response) return response

    // R3#6: Include admin user ID in cache key to prevent cross-admin PII leakage
    const adminUserId = auth.ok ? String(auth.user?.id || 'anon') : 'anon'
    const cacheKey = `admin:students:list:${adminUserId}:${q?.teacher_id || 'all'}:${q?.status || 'all'}:${q?.limit || 50}:${q?.offset || 0}`
    const cached = await cacheGet<Record<string, unknown>>(cacheKey, (v) => (v && typeof v === 'object' ? (v as Record<string, unknown>) : null))
    if (cached) return NextResponse.json(cached)

    let query = admin
      .from('students')
      .select('*, workouts(*)')
      .order('name')
      .range(q?.offset || 0, (q?.offset || 0) + (q?.limit || 50) - 1)

    if (q?.teacher_id) {
      query = query.eq('teacher_id', q.teacher_id)
    }

    if (q?.status && q.status !== 'all') {
      query = query.eq('status', q.status)
    }

    const { data, error } = await query

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })

    const { data: teachers } = await admin
      .from('teachers')
      .select('email, user_id')

    const teacherEmails = new Set((teachers || []).map(t => (t.email || '').toLowerCase()))
    const teacherIds = new Set((teachers || []).map(t => t.user_id).filter(Boolean))

    const { data: teacherProfiles } = await admin
      .from('profiles')
      .select('id, email, role')
      .eq('role', 'teacher')

    for (const p of (teacherProfiles || [])) {
      if (p.email) teacherEmails.add(p.email.toLowerCase())
      if (p.id) teacherIds.add(p.id)
    }

    const filtered = (data || []).filter(s => {
      const email = (s.email || '').toLowerCase()
      const uid = s.user_id || s.id
      if (email && teacherEmails.has(email)) return false
      if (uid && teacherIds.has(uid)) return false
      return true
    })

    // Bug 1 fix: also find profiles that self-registered (have no linked student row)
    // These show up as pending "Solicitações de Cadastro" in the admin panel.
    // IMPORTANT: profiles requesting teacher role must NOT appear here — they go
    // to the SOLICITAÇÕES tab (RequestsTab) via access_requests instead.
    const existingEmails = new Set(filtered.map(s => (s.email || '').toLowerCase()).filter(Boolean))
    const existingUserIds = new Set(filtered.map(s => s.user_id).filter(Boolean))

    const { data: allProfiles } = await admin
      .from('profiles')
      .select('id, display_name, email, photo_url, role, role_requested')
      .not('role', 'eq', 'teacher')
      .order('display_name')

    // Cross-reference access_requests: exclude emails that requested teacher role
    const { data: teacherAccessRequests } = await admin
      .from('access_requests')
      .select('email')
      .eq('role_requested', 'teacher')
    const teacherRequestEmails = new Set(
      (teacherAccessRequests || []).map(r => String(r.email || '').toLowerCase()).filter(Boolean)
    )

    const pendingProfiles = (allProfiles || [])
      .filter(p => {
        if (!p.id) return false
        // skip teachers (by role or by reference in teachers table)
        if (teacherEmails.has((p.email || '').toLowerCase())) return false
        if (teacherIds.has(p.id)) return false
        // skip profiles that requested teacher role (they go to SOLICITAÇÕES tab)
        if (String((p as Record<string, unknown>).role_requested || '').toLowerCase() === 'teacher') return false
        if (p.email && teacherRequestEmails.has(p.email.toLowerCase())) return false
        // skip those already linked to a student row
        if (p.email && existingEmails.has(p.email.toLowerCase())) return false
        if (existingUserIds.has(p.id)) return false
        return true
      })
      .map(p => ({
        id: `pending_${p.id}`,
        user_id: p.id,
        name: p.display_name || null,
        email: p.email || null,
        teacher_id: null as string | null,
        status: 'pendente',
        photo_url: p.photo_url || null,
        is_pending: true,
        workouts: [],
      }))

    const payload = { ok: true, students: filtered, pending_profiles: pendingProfiles }
    await cacheSet(cacheKey, payload, 30)
    return NextResponse.json(payload)
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

