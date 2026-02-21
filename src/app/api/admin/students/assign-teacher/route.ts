import { NextResponse } from 'next/server'
import { parseJsonBody } from '@/utils/zod'
import { z } from 'zod'
import { createAdminClient } from '@/utils/supabase/admin'
import { requireRole, requireRoleWithBearer } from '@/utils/auth/route'
import { getErrorMessage } from '@/utils/errorMessage'

export const dynamic = 'force-dynamic'

const ZodBodySchema = z
  .object({
    student_id: z.string().optional(),
    teacher_user_id: z.string().nullable().optional(),
    teacher_email: z.string().optional(),
    email: z.string().optional(),
  })
  .strip()

export async function POST(req: Request) {
  try {
    let auth = await requireRole(['admin', 'teacher'])
    if (!auth.ok) {
      auth = await requireRoleWithBearer(req, ['admin', 'teacher'])
      if (!auth.ok) return auth.response
    }

    const parsedBody = await parseJsonBody(req, ZodBodySchema)
    if (parsedBody.response) return parsedBody.response
    const body = parsedBody.data!
    const student_id = body?.student_id as string | undefined
    let teacher_user_id = body?.teacher_user_id as string | null
    const teacher_email = (body?.teacher_email || '') as string
    const email = (body?.email || '') as string
    if (!student_id && !email) return NextResponse.json({ ok: false, error: 'missing student identifier' }, { status: 400 })

    const admin = createAdminClient()

    // Resolve teacher_user_id from teacher_email via profiles (auth uid)
    if (!teacher_user_id && teacher_email) {
      const { data: tProfile } = await admin.from('profiles').select('id').ilike('email', teacher_email).maybeSingle()
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
        const { data: existing } = await admin.from('teachers').select('id').ilike('email', p.email).maybeSingle()
        if (!existing) {
          await admin.from('teachers').insert({ email: p.email, name: p.display_name || null, status: 'active' })
        }
      }
    }

    // Resolve student row by id or email/user_id
    let targetId = student_id || ''
    let srow: any | null = null
    if (targetId) {
      const { data } = await admin.from('students').select('id, email').eq('id', targetId).maybeSingle()
      srow = data || null
    }
    if (!srow && email) {
      const { data } = await admin.from('students').select('id, email').ilike('email', email).maybeSingle()
      srow = data || null
    }
    if (!srow && student_id) {
      const { data } = await admin.from('students').select('id').eq('user_id', student_id).maybeSingle()
      srow = data || null
    }
    // Upsert by email if not exists
    if (!srow && email) {
      const { data: profile } = await admin.from('profiles').select('id, display_name').ilike('email', email).maybeSingle()
      const payload: any = { email, teacher_id: teacher_user_id || null }
      if (profile?.display_name) payload.name = profile.display_name
      if (profile?.id) payload.user_id = profile.id
      const { data: ins, error: iErr } = await admin.from('students').insert(payload).select().single()
      if (iErr) return NextResponse.json({ ok: false, error: iErr.message }, { status: 400 })
      srow = ins
    }
    if (!srow) return NextResponse.json({ ok: false, error: 'student not found' }, { status: 404 })

    const { error } = await admin.from('students').update({ teacher_id: teacher_user_id }).eq('id', srow.id)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, student_id: srow.id, teacher_user_id })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}
