import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createHash, randomUUID } from 'crypto'
import { requireUser } from '@/utils/auth/route'
import { parseJsonBody } from '@/utils/zod'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { env } from '@/utils/env'

// R3#1: Client no longer controls folder or publicId — they are built server-side
const BodySchema = z.object({
  purpose: z.enum(['story', 'profile', 'chat', 'assessment', 'progress']).optional().default('story'),
})

export async function POST(req: Request) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  const ip = getRequestIp(req)
  const rl = await checkRateLimitAsync(`cloudinary:sign:${auth.user.id}:${ip}`, 30, 60_000)
  if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

  const parsed = await parseJsonBody(req, BodySchema)
  if (parsed.response) return parsed.response
  const { purpose } = parsed.data!

  const cloudName = env.cloudinary.cloudName
  const apiKey = env.cloudinary.apiKey
  const apiSecret = env.cloudinary.apiSecret
  if (!cloudName || !apiKey || !apiSecret) {
    return NextResponse.json({ ok: false, error: 'Cloudinary not configured' }, { status: 503 })
  }

  // Server-controlled folder and publicId — prevents upload to arbitrary paths
  const folder = `irontracks/user-uploads/${purpose}`
  const publicId = `${auth.user.id}/${randomUUID()}`
  const timestamp = Math.round(Date.now() / 1000)

  // allowed_formats ASSINADO: restringe os tipos de arquivo aceitos (a Cloudinary
  // rejeita formatos fora da lista). Sem isto, dava pra subir formato arbitrário
  // (svg/html/raw) na nossa conta Cloudinary. Story aceita vídeo; o resto, só
  // imagem. Auditoria 2026-06-27 (L13).
  const IMAGE_FORMATS = 'jpg,jpeg,png,webp,gif,heic,heif'
  const allowedFormats = purpose === 'story' ? `${IMAGE_FORMATS},mp4,mov,webm` : IMAGE_FORMATS

  // Signature: params em ORDEM ALFABÉTICA + secret (Cloudinary v1 spec).
  const params = `allowed_formats=${allowedFormats}&folder=${folder}&public_id=${publicId}&timestamp=${timestamp}`
  const signature = createHash('sha1').update(params + apiSecret).digest('hex')

  return NextResponse.json({
    ok: true,
    signature,
    timestamp,
    apiKey,
    cloudName,
    folder,
    publicId,
    allowedFormats,
    uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`,
  })
}
