import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { jsonError, requireRole, resolveRoleByUser } from '@/utils/auth/route'

export const dynamic = 'force-dynamic'

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
    const { data, error } = await admin
      .from('students')
      .select('*, workouts(*)')
      .order('name')

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
  } catch (e) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}
