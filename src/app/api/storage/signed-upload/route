import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { canUploadToChatMediaPath, isSafeStoragePath, requireUser } from '@/utils/auth/route'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { z } from 'zod'
import { parseJsonBody } from '@/utils/zod'
import { getErrorMessage } from '@/utils/errorMessage'

const BodySchema = z
  .object({
    bucket: z.string().default('chat-media'),
    path: z.string().min(1),
  })
  .strip()

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

    const b = await admin.storage.getBucket(bucket)
    if (!b?.data) await admin.storage.createBucket(bucket, { public: true })

    const { data, error } = await admin.storage.from(bucket).createSignedUploadUrl(safe.path)
    if (error || !data) return NextResponse.json({ ok: false, error: error?.message || 'failed to sign' }, { status: 400 })

    return NextResponse.json({ ok: true, path: safe.path, token: data.token })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}
