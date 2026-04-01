import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { requireRoleOrBearer } from '@/utils/auth/route'
import { getErrorMessage } from '@/utils/errorMessage'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const admin = createAdminClient()
    const auth = await requireRoleOrBearer(req, ['admin'])
    if (!auth.ok) return auth.response

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
      .map((p: Record<string, unknown>) => ({
        id: String(p?.id || '').trim(),
        name: p?.display_name != null ? String(p.display_name) : null,
        email: p?.email != null ? String(p.email) : null,
        teacher_id: null as string | null,
        user_id: String(p?.id || '').trim(),
        is_legacy: true as const,
      }))
      .filter((s) => Boolean(s.id))

    return NextResponse.json({ ok: true, students })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}
