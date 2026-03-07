import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { isSafeStoragePath, requireUser } from '@/utils/auth/route'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { z } from 'zod'
import { parseJsonBody } from '@/utils/zod'
import { getErrorMessage } from '@/utils/errorMessage'

export const dynamic = 'force-dynamic'

const ALLOWED_CONTENT_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'video/mp4', 'video/quicktime', 'video/webm',
]

const BodySchema = z
  .object({
    path: z.string().min(1),
    contentType: z.string().min(1),
  })
  .strip()

const isAllowedStoryPath = (userId: string, path: string) => {
  const uid = String(userId || '').trim()
  const p = String(path || '').trim()
  if (!uid || !p) return false
  const parts = p.split('/').filter(Boolean)
  if (parts.length < 3) return false
  if (parts[0] !== uid) return false
  if (parts[1] !== 'stories') return false
  return true
}

export async function POST(request: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response

    const ip = getRequestIp(request)
    const rl = await checkRateLimitAsync(`storage:stories:${auth.user.id}:${ip}`, 10, 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

    const parsedBody = await parseJsonBody(request, BodySchema)
    if (parsedBody.response) return parsedBody.response
    const { path, contentType } = parsedBody.data!

    const normalizedMime = contentType.toLowerCase().split(';')[0].trim()
    if (!ALLOWED_CONTENT_TYPES.includes(normalizedMime)) {
      return NextResponse.json({ ok: false, error: 'Tipo de arquivo não permitido.' }, { status: 400 })
    }

    const bucket = 'social-stories'

    const safe = isSafeStoragePath(path)
    if (!safe.ok) return NextResponse.json({ ok: false, error: safe.error }, { status: 400 })
    if (!isAllowedStoryPath(auth.user.id, safe.path)) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })

    const admin = createAdminClient()
    const LIMIT = 200 * 1024 * 1024
    const b = await admin.storage.getBucket(bucket)
    if (!b?.data) {
      const created = await admin.storage.createBucket(bucket, { public: false, fileSizeLimit: LIMIT })
      if (created.error) return NextResponse.json({ ok: false, error: created.error.message }, { status: 400 })
    } else if (b.data.file_size_limit !== LIMIT) {
      const updated = await admin.storage.updateBucket(bucket, { public: false, fileSizeLimit: LIMIT })
      if (updated.error) return NextResponse.json({ ok: false, error: updated.error.message }, { status: 400 })
    }

    const { data: b2 } = await admin.storage.getBucket(bucket)

    const { data, error } = await admin.storage.from(bucket).createSignedUploadUrl(safe.path)
    if (error || !data) return NextResponse.json({ ok: false, error: getErrorMessage(error) || 'failed to sign' }, { status: 400 })

    return NextResponse.json({ ok: true, bucket, path: safe.path, token: data.token, bucketLimitBytes: b2?.file_size_limit ?? null })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}
