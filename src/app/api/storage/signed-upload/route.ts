import { NextResponse } from 'next/server'
import { respondInternalError } from '@/utils/api/internalError'
import { createAdminClient } from '@/utils/supabase/admin'
import { canUploadToChatMediaPath, isSafeStoragePath, requireUser } from '@/utils/auth/route'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { z } from 'zod'
import { parseJsonBody } from '@/utils/zod'
import { respondDbError } from '@/utils/api/dbError'

const BodySchema = z
  .object({
    bucket: z.string().default('chat-media'),
    path: z.string().min(1),
  })
  .strip()

// Tipos de mídia esperados no chat (imagem/vídeo/áudio). SVG e HTML ficam de
// fora de propósito (stored XSS em bucket público).
const CHAT_MEDIA_EXT = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif',
  'mp4', 'mov', 'm4v', 'webm',
  'm4a', 'mp3', 'aac', 'wav', 'ogg', 'caf',
])
const CHAT_MEDIA_MIME = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif',
  'video/mp4', 'video/quicktime', 'video/webm',
  'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/wav', 'audio/ogg',
]

export async function POST(request: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response

    const ip = getRequestIp(request)
    const rl = await checkRateLimitAsync(`storage:upload:${auth.user.id}:${ip}`, 20, 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

    const admin = createAdminClient()
    const parsedBody = await parseJsonBody(request, BodySchema)
    if (parsedBody.response) return parsedBody.response
    const { bucket, path } = parsedBody.data!
    if (bucket !== 'chat-media') return NextResponse.json({ ok: false, error: 'invalid bucket' }, { status: 400 })

    const safe = isSafeStoragePath(path)
    if (!safe.ok) return NextResponse.json({ ok: false, error: safe.error }, { status: 400 })

    const allowed = await canUploadToChatMediaPath(auth.user.id, safe.channelId)
    if (!allowed) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })

    // Allowlist de extensão: o path é assinado e armazenado como está; sem isto
    // dava pra assinar caminhos .html/.svg/.* e hospedar conteúdo arbitrário no
    // bucket público (stored XSS / abuso de storage) — auditoria 2026-06-27.
    const ext = (safe.path.split('.').pop() || '').toLowerCase()
    if (!ext || !CHAT_MEDIA_EXT.has(ext)) {
      return NextResponse.json({ ok: false, error: 'invalid_file_type' }, { status: 400 })
    }

    const b = await admin.storage.getBucket(bucket)
    if (!b?.data) {
      // public: false SEMPRE — a migration 20260711220000 tornou o chat-media
      // privado (leitura via proxy autorizado). Auditoria 2026-08-13 (SEC-06):
      // este fallback recriava o bucket como público, desfazendo a migration;
      // a rota irmã ensure-bucket, que qualquer usuário logado podia usar para
      // reverter o bucket a público via updateBucket, foi REMOVIDA — não a
      // recrie. Guard: __tests__/chatMediaBucketPrivate.test.ts
      await admin.storage.createBucket(bucket, {
        public: false,
        fileSizeLimit: '50MB',
        allowedMimeTypes: CHAT_MEDIA_MIME,
      })
    }

    const { data, error } = await admin.storage.from(bucket).createSignedUploadUrl(safe.path)
    if (error || !data) return respondDbError('api:storage:signed-upload', error)

    return NextResponse.json({ ok: true, path: safe.path, token: data.token })
  } catch (e: unknown) {
    return respondInternalError('api:storage:signed-upload', e)
  }
}
