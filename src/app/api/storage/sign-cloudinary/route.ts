import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createHash, randomUUID } from 'crypto'
import { requireUser } from '@/utils/auth/route'
import { parseJsonBody } from '@/utils/zod'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'

// R3#1: Client no longer controls folder or publicId — they are built server-side
const BodySchema = z.object({
  purpose: z.enum(['story', 'profile', 'chat', 'assessment']).optional().default('story'),
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

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME
  const apiKey = process.env.CLOUDINARY_API_KEY
  const apiSecret = process.env.CLOUDINARY_API_SECRET
  if (!cloudName || !apiKey || !apiSecret) {
    return NextResponse.json({ ok: false, error: 'Cloudinary not configured' }, { status: 503 })
  }

  // Server-controlled folder and publicId — prevents upload to arbitrary paths
  const folder = `irontracks/user-uploads/${purpose}`
  const publicId = `${auth.user.id}/${randomUUID()}`
  const timestamp = Math.round(Date.now() / 1000)

  // Signature: sorted params concatenated + secret (Cloudinary v1 spec)
  const params = `folder=${folder}&public_id=${publicId}&timestamp=${timestamp}`
  const signature = createHash('sha1').update(params + apiSecret).digest('hex')

  return NextResponse.json({
    ok: true,
    signature,
    timestamp,
    apiKey,
    cloudName,
    folder,
    publicId,
    uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`,
  })
}
