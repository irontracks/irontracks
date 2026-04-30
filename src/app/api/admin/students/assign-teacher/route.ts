import { NextResponse } from 'next/server'
import { parseJsonBody } from '@/utils/zod'
import { z } from 'zod'
import { createAdminClient } from '@/utils/supabase/admin'
import { requireRoleOrBearer } from '@/utils/auth/route'
import { getErrorMessage } from '@/utils/errorMessage'
import { safePgLike } from '@/utils/safePgFilter'
import { resolveStudentRow } from '@/utils/admin/resolveStudent'

export const dynamic = 'force-dynamic'

const ZodBodySchema = z
  .object({
    student_id: z.string().optional(),
    student_user_id: z.string().optional(),
    teacher_user_id: z.string().nullable().optional(),
    teacher_email: z.string().optional(),
    email: z.string().optional(),
  })
  .strip()

export async function POST(req: Request) {
  try {
    const auth = await requireRoleOrBearer(req, ['admin', 'teacher'])
    if (!auth.ok) return auth.response

    const parsedBody = await parseJsonBody(req, ZodBodySchema)
    if (parsedBody.response) return parsedBody.response
    const body = parsedBody.data!
    const student_id = body?.student_id as string | undefined
    const student_user_id = body?.student_user_id as string | undefined
    let teacher_user_id = body?.teacher_user_id as string | null
    const teacher_email = (body?.teacher_email || '') as string
    const email = (body?.email || '') as string
    if (!student_id && !student_user_id && !email) return NextResponse.json({ ok: false, error: 'missing student identifier' }, { status: 400 })

    const admin = createAdminClient()

    // Resolve teacher_user_id from teacher_email via profiles (auth uid)
    if (!teacher_user_id && teacher_email) {
      const { data: tProfile } = await admin.from('profiles').select('id').ilike('email', safePgLike(teacher_email)).maybeSingle()
      teacher_user_id = tProfile?.id || null
    }
    if (!teacher_user_id && String(teacher_email || '').trim()) {
      return NextResponse.json({ ok: false, error: 'teacher profile not found' }, { status: 404 })
    }
    // Validate teacher exists in profiles when assigning (teachers table is optional metadata)
    if (teacher_user_id) {
      const { data: tProfile } = await admin.from('profiles').select('id').eq('id', teacher_user_id).maybeSingle()
      if (!tProfile) return NextResponse.json({ ok: false, error: 'teacher profile not found' }, { status: 404 })
      // Best-effort: ensure a row exists in teachers by email if available (do not fail if missing)
      const { data: p } = await admin.from('profiles').select('display_name, email').eq('id', teacher_user_id).maybeSingle()
      if (p?.email) {
        const { data: existing } = await admin.from('teachers').select('id').ilike('email', safePgLike(p.email)).maybeSingle()
        if (!existing) {
          await admin.from('teachers').insert({ email: p.email, name: p.display_name || null, status: 'active' })
        }
      }
    }

    // Resolve student row via the shared helper. Handles all caller shapes:
    //   - student_id = students.id (PK)
    //   - student_id = "pending_<profile.id>" (auto-creates the row)
    //   - student_user_id = profiles.id / auth uid
    //   - email-only (auto-creates with profile lookup)
    // The helper guarantees `name` is never null, fixing the recurring
    // NOT NULL violation that previously slipped through this INSERT path.
    const lookupId = student_id || student_user_id || ''
    const srow = await resolveStudentRow(admin, { id: lookupId, email })
    if (!srow) return NextResponse.json({ ok: false, error: 'student not found' }, { status: 404 })

    // R3#5: Teachers can only reassign students they own (or unassigned students)
    if (auth.role === 'teacher') {
      const currentTeacher = srow.teacher_id || ''
      if (currentTeacher && currentTeacher !== auth.user.id) {
        return NextResponse.json({ ok: false, error: 'Aluno já pertence a outro professor.' }, { status: 403 })
      }

      // Check plan limit — only when assigning a NEW student (not unassigning)
      const isNewAssignment = teacher_user_id && (!currentTeacher || currentTeacher !== teacher_user_id)
      if (isNewAssignment) {
        const { data: canAdd, error: limitErr } = await admin.rpc('teacher_can_add_student', { p_teacher_user_id: teacher_user_id })
        if (limitErr) return NextResponse.json({ ok: false, error: limitErr.message }, { status: 400 })
        if (!canAdd) {
          return NextResponse.json({
            ok: false,
            error: 'Limite de alunos atingido. Faça upgrade do seu plano para adicionar mais alunos.',
            upgrade_required: true,
          }, { status: 402 })
        }
      }
    }

    const { error } = await admin.from('students').update({ teacher_id: teacher_user_id }).eq('id', srow.id)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, student_id: srow.id, teacher_user_id })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}
