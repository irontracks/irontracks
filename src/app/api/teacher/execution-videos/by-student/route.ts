import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/utils/supabase/admin'
import { requireRole, jsonError } from '@/utils/auth/route'
import { parseSearchParams } from '@/utils/zod'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const isEnabled = () => String(process.env.ENABLE_EXECUTION_VIDEO || '').trim().toLowerCase() === 'true'

const QuerySchema = z.object({
  student_id: z.string().uuid('student_id inválido'),
})

export async function GET(req: Request) {
  if (!isEnabled()) return jsonError(404, 'disabled')

  const auth = await requireRole(['admin', 'teacher'])
  if (!auth.ok) return auth.response

  try {
    const { data: q, response } = parseSearchParams(req, QuerySchema)
    if (response) return response

    const studentUserId = q.student_id.trim()
    if (!studentUserId) return jsonError(400, 'student_user_id_required')

    const admin = createAdminClient()
    const requesterId = String(auth.user.id)

    if (auth.role !== 'admin') {
      const { data: s } = await admin.from('students').select('id').eq('user_id', studentUserId).eq('teacher_id', requesterId).maybeSingle()
      if (!s?.id) return jsonError(403, 'forbidden')
    }

    const { data, error } = await admin
      .from('exercise_execution_submissions')
      .select('id, student_user_id, exercise_library_id, workout_id, exercise_id, exercise_name, notes, status, teacher_feedback, reviewed_by, reviewed_at, created_at, video_bucket_id, video_object_path')
      .eq('student_user_id', studentUserId)
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) return jsonError(400, error.message)

    return NextResponse.json({ ok: true, items: Array.isArray(data) ? data : [] }, { headers: { 'cache-control': 'no-store, max-age=0' } })
  } catch (e) {
    return jsonError(500, e?.message ?? String(e))
  }
}
