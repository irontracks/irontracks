import { NextResponse } from 'next/server'
import { parseJsonBody } from '@/utils/zod'
import { z } from 'zod'
import { createAdminClient } from '@/utils/supabase/admin'
import { requireUser } from '@/utils/auth/route'
import { getErrorMessage } from '@/utils/errorMessage'

const ZodBodySchema = z
  .object({
    name: z.string().optional(),
  })
  .strip()

// Audit Finding #4: bucket chat-media era criado sem fileSizeLimit nem
// allowedMimeTypes — atacante podia upload de .exe/.html de 10GB e hostar
// no domínio Supabase do app. Agora restringimos a mídia legítima de chat
// (imagens, vídeos curtos, áudios). 25MB cobre vídeos curtos do iPhone com
// margem; arquivos maiores devem usar outro fluxo (ex: stories).
const CHAT_MEDIA_LIMITS = {
  fileSizeLimit: 25 * 1024 * 1024, // 25 MB
  allowedMimeTypes: [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/heic',
    'image/heif',
    'video/mp4',
    'video/quicktime',
    'video/webm',
    'audio/mpeg',
    'audio/mp4',
    'audio/aac',
    'audio/wav',
    'audio/webm',
    'audio/ogg',
  ],
} as const

export async function POST(request: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response

    const admin = createAdminClient()
    const parsedBody = await parseJsonBody(request, ZodBodySchema)
    if (parsedBody.response) return parsedBody.response
    const body = (parsedBody.data ?? {}) as z.infer<typeof ZodBodySchema>
    const name = body?.name || 'chat-media'
    if (name !== 'chat-media') return NextResponse.json({ ok: false, error: 'invalid bucket' }, { status: 400 })

    const existing = await admin.storage.getBucket(name)
    if (!existing?.data) {
      // Bucket inexistente — cria já com limits. Mantém public:true por compat
      // com URLs já gravadas em direct_messages.media_url (mudança pra private
      // exigiria backfill de signed URLs e quebraria mensagens antigas).
      await admin.storage.createBucket(name, {
        public: true,
        fileSizeLimit: CHAT_MEDIA_LIMITS.fileSizeLimit,
        allowedMimeTypes: [...CHAT_MEDIA_LIMITS.allowedMimeTypes],
      })
    } else {
      // Bucket existe — atualiza limits sempre (idempotente). Public preserved.
      await admin.storage.updateBucket(name, {
        public: true,
        fileSizeLimit: CHAT_MEDIA_LIMITS.fileSizeLimit,
        allowedMimeTypes: [...CHAT_MEDIA_LIMITS.allowedMimeTypes],
      })
    }
    return NextResponse.json({ ok: true, name })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}
