import { NextResponse } from 'next/server'
import { parseJsonBody } from '@/utils/zod'
import { z } from 'zod'
import { createAdminClient } from '@/utils/supabase/admin'
import { requireUser, jsonError } from '@/utils/auth/route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ZodBodySchema = z
  .object({
    submission_id: z.string().optional(),
    id: z.string().optional(),
  })
  .passthrough()

const isEnabled = () => String(process.env.ENABLE_EXECUTION_VIDEO || '').trim().toLowerCase() === 'true'

export async function POST(req: Request) {
  if (!isEnabled()) return jsonError(404, 'disabled')

  const auth = await requireUser()
  if (!auth.ok) return auth.response

  try {
    const parsedBody = await parseJsonBody(req, ZodBodySchema)
    if (parsedBody.response) return parsedBody.response
    const body = parsedBody.data!
    const submissionId = String(body?.submission_id || body?.id || '').trim()
    if (!submissionId) return jsonError(400, 'submission_id_required')

    const admin = createAdminClient()
    const { data: row, error: rowErr } = await admin
      .from('exercise_execution_submissions')
      .select('id, student_user_id, video_bucket_id, video_object_path')
      .eq('id', submissionId)
      .maybeSingle()
    if (rowErr) return jsonError(400, rowErr.message)
    if (!row?.id) return jsonError(404, 'not_found')

    const requesterId = String(auth.user.id)
    const studentUserId = String(row.student_user_id || '')
    let allowed = requesterId === studentUserId
    if (!allowed) {
      try {
        const { data: s } = await admin.from('students').select('id').eq('user_id', studentUserId).eq('teacher_id', requesterId).maybeSingle()
        if (s?.id) allowed = true
      } catch {}
    }
    if (!allowed) {
      try {
        const { data: prof } = await admin.from('profiles').select('role').eq('id', requesterId).maybeSingle()
        const role = String(prof?.role || '').toLowerCase()
        if (role === 'admin') allowed = true
      } catch {}
    }
    if (!allowed) return jsonError(403, 'forbidden')

    const bucketId = String(row.video_bucket_id || 'execution-videos')
    const objectPath = String(row.video_object_path || '').trim()
    if (!objectPath) return jsonError(400, 'missing_object_path')

    const { data: signed, error: signedErr } = await admin.storage.from(bucketId).createSignedUrl(objectPath, 60 * 10)
    if (signedErr || !signed?.signedUrl) return jsonError(400, signedErr?.message || 'signed_url_failed')

    return NextResponse.json({ ok: true, url: signed.signedUrl }, { headers: { 'cache-control': 'no-store, max-age=0' } })
  } catch (e: any) {
    return jsonError(500, e?.message ?? String(e))
  }
}
