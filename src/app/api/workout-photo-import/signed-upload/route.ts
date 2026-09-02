/**
 * API: POST /api/workout-photo-import/signed-upload
 *
 * Minta um signed upload URL pro bucket PRIVADO workout-imports e registra a
 * linha em workout_photo_import_files. O cliente faz o PUT com
 * uploadToSignedUrl(path, token, file).
 *
 * Path: {user_id}/imports/{importId}/{timestamp}_{safeName} — sempre sob o
 * prefixo do dono, pra casar com o RLS de prefixo do storage.
 *
 * Acesso: só o dono do import. Checagem explícita porque usamos admin client
 * (service role bypassa RLS).
 *
 * Rate limit: 30 req/min (uma ficha pode ter várias páginas).
 */
import { NextResponse } from 'next/server'
import { respondInternalError } from '@/utils/api/internalError'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { parseJsonBody } from '@/utils/zod'
import { respondDbError } from '@/utils/api/dbError'
import {
  WORKOUT_IMPORT_ALLOWED_MIMES,
  WORKOUT_IMPORT_MAX_FILE_BYTES,
  WORKOUT_IMPORT_MAX_FILES,
} from '@/types/workoutPhotoImport'

export const dynamic = 'force-dynamic'

const BUCKET = 'workout-imports'

const BodySchema = z
  .object({
    importId: z.string().uuid(),
    fileName: z.string().min(1).max(160),
    fileSize: z.number().int().positive().max(WORKOUT_IMPORT_MAX_FILE_BYTES),
    mimeType: z.enum(WORKOUT_IMPORT_ALLOWED_MIMES),
  })
  .strip()

/** Remove caracteres exóticos e trunca; preserva a extensão. */
function sanitizeFileName(raw: string): string {
  const trimmed = String(raw || '').trim()
  const dot = trimmed.lastIndexOf('.')
  const ext = dot > 0 ? trimmed.slice(dot).toLowerCase().replace(/[^a-z0-9.]/g, '') : ''
  const base = (dot > 0 ? trimmed.slice(0, dot) : trimmed)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 60)
  return `${base || 'ficha'}${ext}`
}

export async function POST(request: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response
    const userId = String(auth.user.id || '').trim()

    const ip = getRequestIp(request)
    const rl = await checkRateLimitAsync(`workout-import:upload:${userId}:${ip}`, 30, 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

    const parsed = await parseJsonBody(request, BodySchema)
    if (parsed.response) return parsed.response
    const { importId, fileName, fileSize, mimeType } = parsed.data!

    const admin = createAdminClient()

    const { data: imp, error: impErr } = await admin
      .from('workout_photo_imports')
      .select('id, user_id, status')
      .eq('id', importId)
      .maybeSingle()
    if (impErr) return respondDbError('workout-import:signed-upload', impErr, 400)
    if (!imp) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
    if (String(imp.user_id) !== userId) {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
    }

    // Teto de páginas: acima disso a chamada de visão fica cara sem melhorar o
    // resultado — e uma ficha semanal inteira cabe em 3-4 fotos.
    const { count } = await admin
      .from('workout_photo_import_files')
      .select('id', { count: 'exact', head: true })
      .eq('import_id', importId)
    if ((count ?? 0) >= WORKOUT_IMPORT_MAX_FILES) {
      return NextResponse.json({ ok: false, error: 'too_many_files' }, { status: 400 })
    }

    const safeName = sanitizeFileName(fileName)
    const path = `${userId}/imports/${importId}/${Date.now()}_${safeName}`

    const { data: signed, error: signErr } = await admin.storage
      .from(BUCKET)
      .createSignedUploadUrl(path)
    if (signErr || !signed) {
      return respondDbError('api:workout-photo-import:signed-upload', signErr)
    }

    const { error: insErr } = await admin.from('workout_photo_import_files').insert({
      import_id: importId,
      user_id: userId,
      storage_path: path,
      file_name: safeName,
      file_size: fileSize,
      mime_type: mimeType,
    })
    if (insErr) return respondDbError('workout-import:signed-upload:insert', insErr, 400)

    await admin.from('workout_photo_imports').update({ status: 'uploading' }).eq('id', importId)

    return NextResponse.json({ ok: true, path: signed.path, token: signed.token, storagePath: path })
  } catch (e: unknown) {
    return respondInternalError('api:workout-photo-import:signed-upload', e)
  }
}
