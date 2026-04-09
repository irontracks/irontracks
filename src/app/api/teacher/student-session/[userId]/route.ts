import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { getErrorMessage } from '@/utils/errorMessage'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params
    if (!userId) return NextResponse.json({ ok: false, error: 'missing userId' }, { status: 400 })

    // Authenticate teacher
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const admin = createAdminClient()

    // Verify the student belongs to this teacher
    const { data: student, error: studentError } = await admin
      .from('students')
      .select('user_id, teacher_id')
      .eq('user_id', userId)
      .eq('teacher_id', user.id)
      .maybeSingle()

    if (studentError) return NextResponse.json({ ok: false, error: studentError.message }, { status: 400 })
    if (!student) return NextResponse.json({ ok: false, error: 'student not found or not yours' }, { status: 403 })

    // Fetch active session
    const { data: session, error: sessionError } = await admin
      .from('active_workout_sessions')
      .select('user_id, state, started_at, updated_at')
      .eq('user_id', userId)
      .maybeSingle()

    if (sessionError) return NextResponse.json({ ok: false, error: sessionError.message }, { status: 400 })

    return NextResponse.json({ ok: true, session: session ?? null })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}
