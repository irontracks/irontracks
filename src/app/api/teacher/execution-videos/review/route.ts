import { NextResponse } from 'next/server'
import { parseJsonBody } from '@/utils/zod'
import { z } from 'zod'
import { createAdminClient } from '@/utils/supabase/admin'
import { requireRole, jsonError } from '@/utils/auth/route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ZodBodySchema = z
  .object({
    submission_id: z.string().min(1),
    status: z.enum(['approved', 'rejected']),
    feedback: z.string().optional(),
    send_message: z.boolean().optional(),
  })
  .passthrough()

const isEnabled = () => String(process.env.ENABLE_EXECUTION_VIDEO || '').trim().toLowerCase() === 'true'

export async function POST(req: Request) {
  if (!isEnabled()) return jsonError(404, 'disabled')

  const auth = await requireRole(['admin', 'teacher'])
  if (!auth.ok) return auth.response

  try {
    const parsedBody = await parseJsonBody(req, ZodBodySchema)
    if (parsedBody.response) return parsedBody.response
    const body = parsedBody.data!
    const submissionId = String(body?.submission_id || '').trim()
    const status = String(body?.status || '').trim().toLowerCase()
    const feedback = String(body?.feedback || '').trim()
    const sendMessage = Boolean(body?.send_message)
    if (!submissionId) return jsonError(400, 'submission_id_required')
    if (status !== 'approved' && status !== 'rejected') return jsonError(400, 'invalid_status')

    const admin = createAdminClient()
    const requesterId = String(auth.user.id)

    const { data: row, error: rowErr } = await admin
      .from('exercise_execution_submissions')
      .select('id, student_user_id')
      .eq('id', submissionId)
      .maybeSingle()
    if (rowErr) return jsonError(400, rowErr.message)
    if (!row?.id) return jsonError(404, 'not_found')

    const studentUserId = String(row.student_user_id || '').trim()
    if (!studentUserId) return jsonError(400, 'invalid_student')

    if (auth.role !== 'admin') {
      const { data: s } = await admin.from('students').select('id').eq('user_id', studentUserId).eq('teacher_id', requesterId).maybeSingle()
      if (!s?.id) return jsonError(403, 'forbidden')
    }

    const { error: upErr } = await auth.supabase
      .from('exercise_execution_submissions')
      .update({ status, teacher_feedback: feedback || null })
      .eq('id', submissionId)
    if (upErr) return jsonError(400, upErr.message)

    if (sendMessage && feedback) {
      const { data: channelId, error: chErr } = await auth.supabase.rpc('get_or_create_direct_channel', {
        user1: requesterId,
        user2: studentUserId,
      })
      if (!chErr && channelId) {
        await auth.supabase.from('direct_messages').insert({
          channel_id: channelId,
          sender_id: requesterId,
          content: feedback,
        })
      }
    }

    return NextResponse.json({ ok: true }, { headers: { 'cache-control': 'no-store, max-age=0' } })
  } catch (e) {
    return jsonError(500, e?.message ?? String(e))
  }
}
