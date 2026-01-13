import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'

const ADMIN_EMAIL = 'djmkapple@gmail.com'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const studentId = body?.studentId as string | undefined
    const title = (body?.title || '') as string
    const message = (body?.message || '') as string
    const type = (body?.type || 'appointment') as string

    if (!studentId || !title || !message) {
      return NextResponse.json({ ok: false, error: 'invalid' }, { status: 400 })
    }

    const { data: student, error: studentError } = await supabase
      .from('students')
      .select('id, user_id, teacher_id, email, name')
      .eq('id', studentId)
      .maybeSingle()

    if (studentError) {
      return NextResponse.json({ ok: false, error: studentError.message }, { status: 400 })
    }

    if (!student) {
      return NextResponse.json({ ok: false, error: 'student_not_found' }, { status: 404 })
    }

    if (
      student.teacher_id &&
      student.teacher_id !== user.id &&
      (user.email || '').toLowerCase().trim() !== ADMIN_EMAIL.toLowerCase().trim()
    ) {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
    }

    const targetUserId = student.user_id as string | null
    if (!targetUserId) {
      return NextResponse.json({ ok: true, notified: false })
    }

    const admin = createAdminClient()
    const { error: insertError } = await admin.from('notifications').insert({
      user_id: targetUserId,
      title,
      message,
      type,
    })

    if (insertError) {
      return NextResponse.json({ ok: false, error: insertError.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true, notified: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}

