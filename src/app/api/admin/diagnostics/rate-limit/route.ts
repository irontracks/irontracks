/**
 * GET /api/admin/diagnostics/rate-limit
 *
 * Admin-only runtime diagnostic (round 2) for Finding #54. The first fix
 * (off-by-one in getRequestIp) didn't eliminate the 60 × 400 / 0 × 429
 * behavior, so we need to inspect the *exact* key the rate-limit is built
 * from on each request. If the key varies per request, rate-limit never bucketizes.
 *
 * Admin-gated. Does NOT leak URL/token values — only structural info.
 */
import { NextResponse, NextRequest } from 'next/server'
import { requireRole } from '@/utils/auth/route'
import { checkRateLimitAsync, RATE_LIMIT_BACKEND, getRequestIp } from '@/utils/rateLimit'
import { env } from '@/utils/env'
import { randomBytes } from 'crypto'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await requireRole(['admin'])
  if (!auth.ok) return auth.response

  const xff = String(req.headers.get('x-forwarded-for') || '').trim()
  const xffParts = xff ? xff.split(',').map((s) => s.trim()).filter(Boolean) : []
  const xRealIp = String(req.headers.get('x-real-ip') || '').trim()
  const detectedIp = getRequestIp(req)
  const trustedProxyDepth = env.security.trustedProxyDepth

  const nonceKey = `_diag:${randomBytes(4).toString('hex')}`
  let livePingResult = null
  let livePingError: string | null = null
  const t0 = Date.now()
  try {
    livePingResult = await checkRateLimitAsync(nonceKey, 1000, 60_000)
  } catch (e) {
    livePingError = e instanceof Error ? e.message : String(e)
  }
  const livePingMs = Date.now() - t0

  // Simulate the exercise-chat key shape (without touching the real bucket)
  const simulatedKey = `ai:exercise-chat:${auth.user.id}:${detectedIp}`

  return NextResponse.json(
    {
      backend: RATE_LIMIT_BACKEND,
      detectedIp,
      simulatedKeyShape: simulatedKey,
      trustedProxyDepth,
      xff,
      xffParts,
      xRealIp,
      livePingMs,
      livePingResult,
      livePingError,
      vercelHeaders: {
        ip: req.headers.get('x-vercel-ip-country') ? 'present' : null,
        fwd: req.headers.get('x-vercel-forwarded-for') ? 'present' : null,
      },
      runtimeEnv: {
        VERCEL: process.env.VERCEL ?? null,
        VERCEL_ENV: process.env.VERCEL_ENV ?? null,
        VERCEL_REGION: process.env.VERCEL_REGION ?? null,
      },
    },
    { headers: { 'cache-control': 'no-store, max-age=0' } }
  )
}
