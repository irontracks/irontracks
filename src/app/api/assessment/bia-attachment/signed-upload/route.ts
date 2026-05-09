/**
 * POST /api/assessment/bia-attachment/signed-upload
 *
 * Cria uma URL assinada (signed-upload) para o frontend enviar
 * diretamente o PDF/imagem da bioimpedância para o Supabase Storage,
 * sem que o arquivo passe pelo nosso server.
 *
 * Caminho permitido: `{user_id}/bia/{nome_seguro_unico}.{ext}`
 * Bucket:           `bioimpedance-files` (público)
 * Tipos aceitos:    PDF, JPEG, PNG, WEBP, HEIC
 * Limite por arquivo: 15 MB
 *
 * Após upload o frontend chama `getPublicUrl()` e persiste a URL
 * em `assessments.bia_attachment_url`.
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { isSafeStoragePath, requireUser } from '@/utils/auth/route'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { z } from 'zod'
import { parseJsonBody } from '@/utils/zod'
import { getErrorMessage } from '@/utils/errorMessage'

export const dynamic = 'force-dynamic'

const ALLOWED_CONTENT_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]

const BUCKET = 'bioimpedance-files'
const FILE_LIMIT_BYTES = 15 * 1024 * 1024 // 15 MB

const BodySchema = z
  .object({
    path: z.string().min(1),
    contentType: z.string().min(1),
  })
  .strip()

/**
 * Path policy: o caminho precisa começar pelo user_id do caller, seguir
 * com 'bia/', e ter ao menos um nome de arquivo. Garante que um usuário
 * não consiga sobrescrever arquivos de outro nem espalhar lixo no bucket.
 */
const isAllowedBiaPath = (userId: string, path: string): boolean => {
  const uid = String(userId || '').trim()
  const p = String(path || '').trim()
  if (!uid || !p) return false
  const parts = p.split('/').filter(Boolean)
  if (parts.length < 3) return false
  if (parts[0] !== uid) return false
  if (parts[1] !== 'bia') return false
  return true
}

export async function POST(request: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response

    const ip = getRequestIp(request)
    const rl = await checkRateLimitAsync(`storage:bia:${auth.user.id}:${ip}`, 10, 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

    const parsedBody = await parseJsonBody(request, BodySchema)
    if (parsedBody.response) return parsedBody.response
    const { path, contentType } = parsedBody.data!

    const normalizedMime = contentType.toLowerCase().split(';')[0].trim()
    if (!ALLOWED_CONTENT_TYPES.includes(normalizedMime)) {
      return NextResponse.json(
        { ok: false, error: 'Tipo de arquivo não permitido. Aceito: PDF, JPG, PNG, WEBP, HEIC.' },
        { status: 400 },
      )
    }

    const safe = isSafeStoragePath(path)
    if (!safe.ok) return NextResponse.json({ ok: false, error: safe.error }, { status: 400 })
    if (!isAllowedBiaPath(auth.user.id, safe.path)) {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
    }

    const admin = createAdminClient()
    const b = await admin.storage.getBucket(BUCKET)
    if (!b?.data) {
      const created = await admin.storage.createBucket(BUCKET, {
        public: true,
        fileSizeLimit: FILE_LIMIT_BYTES,
        allowedMimeTypes: ALLOWED_CONTENT_TYPES,
      })
      if (created.error) return NextResponse.json({ ok: false, error: created.error.message }, { status: 400 })
    } else if (b.data.file_size_limit !== FILE_LIMIT_BYTES) {
      const updated = await admin.storage.updateBucket(BUCKET, {
        public: true,
        fileSizeLimit: FILE_LIMIT_BYTES,
        allowedMimeTypes: ALLOWED_CONTENT_TYPES,
      })
      if (updated.error) return NextResponse.json({ ok: false, error: updated.error.message }, { status: 400 })
    }

    const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(safe.path)
    if (error || !data) {
      return NextResponse.json(
        { ok: false, error: getErrorMessage(error) || 'failed to sign' },
        { status: 400 },
      )
    }

    // Public URL é estável e pode ser construída antes do upload existir.
    // Frontend usa esse mesmo URL após confirmar que o upload deu certo.
    const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(safe.path)

    return NextResponse.json({
      ok: true,
      bucket: BUCKET,
      path: safe.path,
      token: data.token,
      publicUrl: pub.publicUrl,
      bucketLimitBytes: FILE_LIMIT_BYTES,
    })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}
