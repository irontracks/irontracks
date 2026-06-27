/**
 * POST /api/assessment/bia-attachment/signed-url
 *
 * Minta uma signed URL de CURTA duração para LER um anexo de bioimpedância do
 * bucket privado `bioimpedance-files`. Substitui a antiga URL pública (que
 * deixava documentos médicos acessíveis sem auth — auditoria 2026-06-27 M2/M5).
 *
 * Acesso: dono do path, professor vinculado ou admin (canAccessBiaPath).
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/utils/supabase/admin'
import { isSafeStoragePath, requireUser } from '@/utils/auth/route'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { parseJsonBody } from '@/utils/zod'
import { getErrorMessage } from '@/utils/errorMessage'
import { BIA_BUCKET, canAccessBiaPath } from '@/utils/storage/biaAttachmentAccess'

export const dynamic = 'force-dynamic'

const SIGNED_URL_TTL_SECONDS = 60

const BodySchema = z.object({ path: z.string().min(1) }).strip()

export async function POST(request: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response

    const ip = getRequestIp(request)
    const rl = await checkRateLimitAsync(`storage:bia:read:${auth.user.id}:${ip}`, 30, 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

    const parsedBody = await parseJsonBody(request, BodySchema)
    if (parsedBody.response) return parsedBody.response
    const { path } = parsedBody.data!

    const safe = isSafeStoragePath(path)
    if (!safe.ok) return NextResponse.json({ ok: false, error: safe.error }, { status: 400 })

    if (!(await canAccessBiaPath({ id: auth.user.id, email: auth.user.email }, safe.path))) {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
    }

    const admin = createAdminClient()
    const { data, error } = await admin.storage.from(BIA_BUCKET).createSignedUrl(safe.path, SIGNED_URL_TTL_SECONDS)
    if (error || !data?.signedUrl) {
      return NextResponse.json({ ok: false, error: getErrorMessage(error) || 'failed_to_sign' }, { status: 400 })
    }

    return NextResponse.json({ ok: true, url: data.signedUrl, expiresIn: SIGNED_URL_TTL_SECONDS })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}
