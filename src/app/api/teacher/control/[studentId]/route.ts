import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/utils/supabase/admin'
import { requireRoleOrBearer, requireUser } from '@/utils/auth/route'
import { getErrorMessage } from '@/utils/errorMessage'
import { parseJsonBody } from '@/utils/zod'
import { sendPushToAllPlatforms } from '@/lib/push/sender'

export const dynamic = 'force-dynamic'

const BodySchema = z.object({
  action: z.enum(['request', 'release', 'accept', 'reject']),
}).strip()

export async function POST(
  req: Request,
  { params }: { params: Promise<{ studentId: string }> }
) {
  try {
    const { studentId } = await params
    if (!studentId) return NextResponse.json({ ok: false, error: 'missing studentId' }, { status: 400 })

    const parsed = await parseJsonBody(req, BodySchema)
    if (parsed.response) return parsed.response
    const { action } = parsed.data!

    const admin = createAdminClient()

    // ── student actions: accept / reject (caller must be the student) ──────────
    if (action === 'accept' || action === 'reject') {
      const auth = await requireUser()
      if (!auth.ok) return auth.response
      if (auth.user.id !== studentId) {
        return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
      }

      const { data: session, error: selErr } = await admin
        .from('active_workout_sessions')
        .select('controlled_by, control_status')
        .eq('user_id', studentId)
        .maybeSingle()

      if (selErr) return NextResponse.json({ ok: false, error: selErr.message }, { status: 400 })
      if (!session) return NextResponse.json({ ok: false, error: 'no active session' }, { status: 404 })
      if (!session.controlled_by) return NextResponse.json({ ok: false, error: 'no control request' }, { status: 400 })

      const teacherId = String(session.controlled_by)

      if (action === 'accept') {
        const { error } = await admin
          .from('active_workout_sessions')
          .update({ control_status: 'active' })
          .eq('user_id', studentId)

        if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })

        // Fetch student name for push
        const { data: studentProfile } = await admin
          .from('profiles')
          .select('display_name')
          .eq('id', studentId)
          .maybeSingle()

        await sendPushToAllPlatforms(
          [teacherId],
          '🎮 Controle aceito!',
          `${studentProfile?.display_name ?? 'Aluno'} aceitou o controle do treino.`,
          { type: 'teacher_control_accepted', studentId },
        )
        return NextResponse.json({ ok: true })
      }

      // reject
      const { error } = await admin
        .from('active_workout_sessions')
        .update({ controlled_by: null, control_status: null })
        .eq('user_id', studentId)

      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })

      const { data: studentProfile } = await admin
        .from('profiles')
        .select('display_name')
        .eq('id', studentId)
        .maybeSingle()

      await sendPushToAllPlatforms(
        [teacherId],
        '❌ Controle recusado',
        `${studentProfile?.display_name ?? 'Aluno'} recusou o controle do treino.`,
        { type: 'teacher_control_rejected', studentId },
      )
      return NextResponse.json({ ok: true })
    }

    // ── teacher actions: request / release ────────────────────────────────────
    const teacherAuth = await requireRoleOrBearer(req, ['admin', 'teacher'])
    if (!teacherAuth.ok) return teacherAuth.response
    const teacherId = teacherAuth.user.id

    // Verify this student belongs to the teacher (admins can control any student)
    if (teacherAuth.role !== 'admin') {
      const { data: student, error: stuErr } = await admin
        .from('students')
        .select('user_id')
        .eq('user_id', studentId)
        .eq('teacher_id', teacherId)
        .maybeSingle()
      if (stuErr) return NextResponse.json({ ok: false, error: stuErr.message }, { status: 400 })
      if (!student) return NextResponse.json({ ok: false, error: 'student not found or not yours' }, { status: 403 })
    }

    if (action === 'request') {
      const { data: session, error: selErr } = await admin
        .from('active_workout_sessions')
        .select('user_id, controlled_by, control_status')
        .eq('user_id', studentId)
        .maybeSingle()

      if (selErr) return NextResponse.json({ ok: false, error: selErr.message }, { status: 400 })
      if (!session) return NextResponse.json({ ok: false, error: 'student has no active session' }, { status: 404 })
      if (session.control_status === 'active') {
        return NextResponse.json({ ok: false, error: 'session already controlled' }, { status: 409 })
      }
      // If another teacher (not this one and not admin override) already has a pending request,
      // block silently overwriting it.
      if (
        session.control_status === 'requested' &&
        session.controlled_by &&
        session.controlled_by !== teacherId &&
        teacherAuth.role !== 'admin'
      ) {
        return NextResponse.json(
          { ok: false, error: 'another teacher has a pending control request' },
          { status: 409 },
        )
      }

      const { error } = await admin
        .from('active_workout_sessions')
        .update({ controlled_by: teacherId, control_status: 'requested' })
        .eq('user_id', studentId)

      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })

      // Fetch teacher name for push
      const { data: teacherProfile } = await admin
        .from('profiles')
        .select('display_name')
        .eq('id', teacherId)
        .maybeSingle()

      await sendPushToAllPlatforms(
        [studentId],
        '🎮 Solicitação de controle',
        `Prof. ${teacherProfile?.display_name ?? 'Professor'} quer controlar seu treino.`,
        { type: 'teacher_control_request', teacherId, teacherName: teacherProfile?.display_name ?? 'Professor' },
      )
      return NextResponse.json({ ok: true })
    }

    // release
    const { data: session, error: selErr } = await admin
      .from('active_workout_sessions')
      .select('controlled_by')
      .eq('user_id', studentId)
      .maybeSingle()

    if (selErr) return NextResponse.json({ ok: false, error: selErr.message }, { status: 400 })
    if (!session) return NextResponse.json({ ok: false, error: 'no active session' }, { status: 404 })
    // Admins can release any control; teachers only if they are the controller
    if (teacherAuth.role !== 'admin' && session.controlled_by !== teacherId) {
      return NextResponse.json({ ok: false, error: 'not the controller' }, { status: 403 })
    }

    const { error } = await admin
      .from('active_workout_sessions')
      .update({ controlled_by: null, control_status: null })
      .eq('user_id', studentId)

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })

    await sendPushToAllPlatforms(
      [studentId],
      '✅ Controle encerrado',
      'O professor encerrou o controle do seu treino.',
      { type: 'teacher_control_released', teacherId },
    )
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}
