/**
 * API: POST /api/lab-exams/signed-upload
 *
 * Minta um signed upload URL pro bucket PRIVADO lab-exams e registra a linha
 * em lab_exam_files. O cliente faz o PUT com uploadToSignedUrl(path, token, file).
 *
 * Acesso: dono (user_id) OU personal (trainer_id) do exame. Checagem explícita
 * porque usamos admin client (service role bypassa RLS).
 *
 * Path: {assessed_user_id}/exams/{examId}/{timestamp}_{safeName} — sempre sob o
 * prefixo do AVALIADO, pra casar com o RLS de prefixo do storage.
 *
 * Rate limit: 30 req/min por usuário (vários arquivos por exame).
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { parseJsonBody } from '@/utils/zod'
import { getErrorMessage } from '@/utils/errorMessage'
import { LAB_EXAM_ALLOWED_MIMES, LAB_EXAM_MAX_FILE_BYTES, LAB_EXAM_MAX_FILES } from '@/types/labExam'

export const dynamic = 'force-dynamic'

const BUCKET = 'lab-exams'

const BodySchema = z
  .object({
    examId: z.string().uuid(),
    fileName: z.string().min(1).max(160),
    fileSize: z.number().int().positive().max(LAB_EXAM_MAX_FILE_BYTES),
    mimeType: z.enum(LAB_EXAM_ALLOWED_MIMES),
  })
  .strip()

/** Remove caracteres exóticos e trunca; preserva a extensão. */
function sanitizeFileName(raw: string): string {
  const trimmed = String(raw || '').trim()
  const dot = trimmed.lastIndexOf('.')
  const ext = dot > 0 ? trimmed.slice(dot).toLowerCase().replace(/[^a-z0-9.]/g, '') : ''
  const base = (dot > 0 ? trimmed.slice(0, dot) : trimmed)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove acentos
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 60)
  return `${base || 'exame'}${ext}`
}

export async function POST(request: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response
    const userId = String(auth.user.id || '').trim()

    const ip = getRequestIp(request)
    const rl = await checkRateLimitAsync(`lab-exams:upload:${userId}:${ip}`, 30, 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

    const parsed = await parseJsonBody(request, BodySchema)
    if (parsed.response) return parsed.response
    const { examId, fileName, fileSize, mimeType } = parsed.data!

    const admin = createAdminClient()

    // Access check: dono ou personal do exame
    const { data: exam, error: eErr } = await admin
      .from('lab_exams')
      .select('id, user_id, trainer_id')
      .eq('id', examId)
      .maybeSingle()
    if (eErr) return NextResponse.json({ ok: false, error: eErr.message }, { status: 400 })
    if (!exam) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })

    const assessedUserId = String((exam as { user_id?: string }).user_id || '')
    const trainerId = (exam as { trainer_id?: string | null }).trainer_id || null
    if (userId !== assessedUserId && userId !== trainerId) {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
    }

    // Limite de arquivos por exame
    const { count } = await admin
      .from('lab_exam_files')
      .select('id', { count: 'exact', head: true })
      .eq('exam_id', examId)
    if ((count ?? 0) >= LAB_EXAM_MAX_FILES) {
      return NextResponse.json({ ok: false, error: 'too_many_files' }, { status: 400 })
    }

    const safeName = sanitizeFileName(fileName)
    const path = `${assessedUserId}/exams/${examId}/${Date.now()}_${safeName}`

    const { data: signed, error: signErr } = await admin.storage
      .from(BUCKET)
      .createSignedUploadUrl(path)
    if (signErr || !signed) {
      return NextResponse.json({ ok: false, error: signErr?.message || 'failed_to_sign' }, { status: 400 })
    }

    const { error: insErr } = await admin.from('lab_exam_files').insert({
      exam_id: examId,
      user_id: assessedUserId,
      storage_path: path,
      file_name: safeName,
      file_size: fileSize,
      mime_type: mimeType,
    })
    if (insErr) return NextResponse.json({ ok: false, error: insErr.message }, { status: 400 })

    return NextResponse.json({ ok: true, path: signed.path, token: signed.token, storagePath: path })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}
