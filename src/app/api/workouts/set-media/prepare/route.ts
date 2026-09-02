import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { parseJsonBody } from '@/utils/zod'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { createAdminClient } from '@/utils/supabase/admin'
import { respondDbError } from '@/utils/api/dbError'
import { respondInternalError } from '@/utils/api/internalError'
import { SET_MEDIA_MAX_BYTES, mediaKindFromMime } from '@/lib/workout/setMedia'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* ──────────────────────────────────────────────────────────
 * POST /api/workouts/set-media/prepare
 *
 * Cria a linha em `workout_set_media` e devolve a URL assinada de upload para
 * o bucket privado `set-media` — mesmo desenho do execution-videos/prepare.
 * O `workout_id` fica nulo aqui: o treino ainda está em andamento; a
 * finalização liga a linha ao treino e dispara a análise.
 * ────────────────────────────────────────────────────────── */

const BodySchema = z
  .object({
    exerciseIndex: z.number().int().min(0).max(99),
    setIndex: z.number().int().min(0).max(99),
    exerciseName: z.string().trim().max(120).optional(),
    contentType: z.string().trim().min(1).max(100),
    fileSize: z.number().int().min(1).max(SET_MEDIA_MAX_BYTES),
    fileName: z.string().trim().max(200).optional(),
  })
  .strip()

const extFor = (mime: string, fileName: string) => {
  const fn = fileName.toLowerCase()
  const m = fn.match(/\.(jpe?g|png|webp|heic|heif|mp4|mov|webm|m4v)$/)
  if (m) return `.${m[1] === 'jpeg' ? 'jpg' : m[1]}`
  if (mime.includes('quicktime')) return '.mov'
  if (mime.includes('webm')) return '.webm'
  if (mime.startsWith('video/')) return '.mp4'
  if (mime.includes('png')) return '.png'
  if (mime.includes('webp')) return '.webp'
  return '.jpg'
}

export async function POST(req: Request) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response
  const userId = String(auth.user.id)
  const ip = getRequestIp(req)
  const rl = await checkRateLimitAsync(`set-media:prepare:${userId}:${ip}`, 30, 60_000)
  if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })
  try {
    const parsed = await parseJsonBody(req, BodySchema)
    if (parsed.response || !parsed.data) return parsed.response ?? NextResponse.json({ ok: false, error: 'Invalid input' }, { status: 400 })
    const body = parsed.data
    const mime = body.contentType.toLowerCase()
    const kind = mediaKindFromMime(mime)
    if (!kind) return NextResponse.json({ ok: false, error: 'unsupported_media_type' }, { status: 400 })

    const admin = createAdminClient()
    const id = globalThis.crypto.randomUUID()
    const objectPath = `${userId}/${id}${extFor(mime, String(body.fileName || ''))}`
    const { error: insertErr } = await admin.from('workout_set_media').insert({
      id,
      user_id: userId,
      exercise_index: body.exerciseIndex,
      set_index: body.setIndex,
      exercise_name: body.exerciseName || null,
      kind,
      bucket_id: 'set-media',
      object_path: objectPath,
      mime_type: mime,
      file_size: body.fileSize,
      ai_status: 'pending',
    })
    if (insertErr) return respondDbError('api:workouts:set-media:prepare', insertErr)

    const { data: signed, error: signedErr } = await admin.storage.from('set-media').createSignedUploadUrl(objectPath)
    if (signedErr || !signed?.token) return respondDbError('api:workouts:set-media:prepare:sign', signedErr)
    return NextResponse.json(
      { ok: true, id, kind, bucket: 'set-media', path: objectPath, token: signed.token },
      { headers: { 'cache-control': 'no-store, max-age=0' } },
    )
  } catch (e: unknown) {
    return respondInternalError('api:workouts:set-media:prepare', e)
  }
}
