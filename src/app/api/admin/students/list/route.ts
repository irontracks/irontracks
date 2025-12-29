import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'

export const dynamic = 'force-dynamic'

const ADMIN_EMAIL = 'djmkapple@gmail.com'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || user.email !== ADMIN_EMAIL) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    }

    const admin = createAdminClient()
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
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}
