import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { jsonError, requireRole, resolveRoleByUser } from '@/utils/auth/route'
import { z } from 'zod'
import { parseSearchParams } from '@/utils/zod'

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

    const { data: q, response } = parseSearchParams(req, QuerySchema)
    if (response) return response

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

    return NextResponse.json({ ok: true, students: filtered })
  } catch (e: any) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
