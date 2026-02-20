import { NextResponse } from 'next/server'
import { parseJsonBody } from '@/utils/zod'
import { z } from 'zod'
import { createAdminClient } from '@/utils/supabase/admin'
import { requireUser, jsonError } from '@/utils/auth/route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ZodBodySchema = z
  .object({
    exercise_name: z.string().optional(),
    notes: z.string().optional(),
    exercise_library_id: z.string().optional(),
    workout_id: z.string().optional(),
    exercise_id: z.string().optional(),
    file_name: z.string().optional(),
    content_type: z.string().optional(),
  })
  .strip()

const isEnabled = () => String(process.env.ENABLE_EXECUTION_VIDEO || '').trim().toLowerCase() === 'true'

const pickExt = (fileName: string, contentType: string) => {
  const fn = String(fileName || '').toLowerCase()
  if (fn.endsWith('.mp4')) return '.mp4'
  if (fn.endsWith('.mov')) return '.mov'
  if (fn.endsWith('.webm')) return '.webm'
  const ct = String(contentType || '').toLowerCase()
  if (ct.includes('webm')) return '.webm'
  if (ct.includes('quicktime')) return '.mov'
  return '.mp4'
}

export async function POST(req: Request) {
  if (!isEnabled()) return jsonError(404, 'disabled')

  const auth = await requireUser()
  if (!auth.ok) return auth.response

  try {
    const parsedBody = await parseJsonBody(req, ZodBodySchema)
    if (parsedBody.response) return parsedBody.response
    const body = parsedBody.data!
    const userId = String(auth.user.id)
    const admin = createAdminClient()

    const { data: student } = await admin.from('students').select('teacher_id').eq('user_id', userId).maybeSingle()
    const teacherId = student?.teacher_id ? String(student.teacher_id) : ''
    if (!teacherId) return jsonError(400, 'no_teacher_assigned')

    const submissionId = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const exerciseName = String(body?.exercise_name || '').trim() || null
    const notes = String(body?.notes || '').trim() || null

    const exerciseLibraryId = body?.exercise_library_id ? String(body.exercise_library_id) : null
    const workoutId = body?.workout_id ? String(body.workout_id) : null
    const exerciseId = body?.exercise_id ? String(body.exercise_id) : null

    const fileName = String(body?.file_name || '').trim()
    const contentType = String(body?.content_type || '').trim()
    const ext = pickExt(fileName, contentType)
    const objectPath = `${userId}/${submissionId}/video${ext}`
    const bucketId = 'execution-videos'

    const { error: insertErr } = await admin.from('exercise_execution_submissions').insert({
      id: submissionId,
      student_user_id: userId,
      exercise_library_id: exerciseLibraryId,
      workout_id: workoutId,
      exercise_id: exerciseId,
      exercise_name: exerciseName,
      notes,
      video_bucket_id: bucketId,
      video_object_path: objectPath,
      status: 'pending',
    })
    if (insertErr) return jsonError(400, insertErr.message)

    try {
      const { data: existing } = await admin.storage.getBucket(bucketId)
      const LIMIT = 200 * 1024 * 1024
      if (!existing?.id) {
        await admin.storage.createBucket(bucketId, { public: false, fileSizeLimit: LIMIT })
      } else if (existing.file_size_limit !== LIMIT) {
        await admin.storage.updateBucket(bucketId, { public: false, fileSizeLimit: LIMIT })
      }
    } catch {}

    const { data: signed, error: signedErr } = await admin.storage.from(bucketId).createSignedUploadUrl(objectPath)
    if (signedErr || !signed?.token) return jsonError(400, signedErr?.message || 'signed_upload_failed')

    return NextResponse.json(
      { ok: true, submission_id: submissionId, bucket: bucketId, path: objectPath, token: signed.token, teacher_user_id: teacherId },
      { headers: { 'cache-control': 'no-store, max-age=0' } },
    )
  } catch (e: any) {
    return jsonError(500, e?.message ?? String(e))
  }
}
