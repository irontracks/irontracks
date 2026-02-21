import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { requireRole } from '@/utils/auth/route'
import { parseJsonBody } from '@/utils/zod'

export const dynamic = 'force-dynamic'

const ZodBodySchema = z
  .object({
    studentId: z.string().min(1),
    title: z.string().min(1),
    message: z.string().min(1),
    type: z.string().optional().default('appointment'),
  })
  .strip()

export async function POST(req: Request) {
  try {
    const auth = await requireRole(['admin', 'teacher'])
    if (!auth.ok) return auth.response
    const supabase = auth.supabase
    const user = auth.user

    const parsedBody = await parseJsonBody(req, ZodBodySchema)
    if (parsedBody.response) return parsedBody.response
    const body = parsedBody.data!
    const studentId = body.studentId as string | undefined
    const title = body.title as string
    const message = body.message as string
    const type = body.type as string

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

    if (student.teacher_id && student.teacher_id !== user.id && auth.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
    }

    const targetUserId = student.user_id as string | null
    if (!targetUserId) {
      return NextResponse.json({ ok: true, notified: false })
    }

    const admin = createAdminClient()
    const { data: prefRow } = await admin
      .from('user_settings')
      .select('preferences')
      .eq('user_id', targetUserId)
      .maybeSingle()

    const prefs = prefRow?.preferences && typeof prefRow.preferences === 'object' ? prefRow.preferences : null
    const allow = prefs ? prefs.notifyAppointments !== false : true
    if (!allow) return NextResponse.json({ ok: true, notified: false })

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
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: (e as { message?: string })?.message ?? String(e) }, { status: 500 })
  }
}
