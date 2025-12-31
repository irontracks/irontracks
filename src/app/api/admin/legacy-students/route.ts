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

    // Get all distinct user_ids from workouts (fallback when athlete_uuid column is not available)
    const { data: workouts, error: wError } = await admin
      .from('workouts')
      .select('user_id')
      .not('user_id', 'is', null)
    
    if (wError) throw wError

    // Extract unique UUIDs
    const athleteIds = Array.from(new Set((workouts || []).map(w => w.user_id).filter(Boolean)))

    if (athleteIds.length === 0) return NextResponse.json({ ok: true, students: [] })

    // Fetch profiles for these IDs
    const { data: profiles, error: pError } = await admin
      .from('profiles')
      .select('id, display_name, email, photo_url, role')
      .in('id', athleteIds)
      .order('display_name')

    if (pError) throw pError

    // Exclude teachers
    const { data: teachers } = await admin
      .from('teachers')
      .select('email, user_id')

    const tEmails = new Set((teachers || []).map(t => (t.email || '').toLowerCase()))
    const students = (profiles || [])
      .filter(p => (p.role !== 'teacher') && (!p.email || !tEmails.has(p.email.toLowerCase())))
      .map(p => ({
        id: p.id,
        name: p.display_name,
        email: p.email,
        teacher_id: null,
        user_id: p.id,
        is_legacy: true
      }))

    return NextResponse.json({ ok: true, students })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}
