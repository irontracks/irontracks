/**
 * GET /api/admin/diagnostics/rate-limit?n=<N>
 *
 * Admin-only diagnostic for Finding #54. Calls checkRateLimitAsync N times
 * with the SAME key in sequence and returns every result. If `remaining`
 * decrements monotonically, Upstash is working. If it stays constant at
 * max or flips to memory-mode shape, the helper is returning the memory
 * fallback despite backend showing 'redis'.
 *
 * Default N=5. Max 30 to avoid abuse.
 */
import { NextResponse, NextRequest } from 'next/server'
import { requireRole } from '@/utils/auth/route'
import { checkRateLimitAsync, RATE_LIMIT_BACKEND, getRequestIp } from '@/utils/rateLimit'
import { env } from '@/utils/env'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await requireRole(['admin'])
  if (!auth.ok) return auth.response

  const url = new URL(req.url)
  const n = Math.min(30, Math.max(1, Number(url.searchParams.get('n') || '5')))

  const detectedIp = getRequestIp(req)
  const stableKey = `diag:probe:${auth.user.id}`

  const samples = []
  for (let i = 0; i < n; i++) {
    const t0 = Date.now()
    try {
      const result = await checkRateLimitAsync(stableKey, 1000, 60_000)
      samples.push({
        iter: i,
        ok: true,
        ms: Date.now() - t0,
        remaining: result.remaining,
        allowed: result.allowed,
      })
    } catch (e) {
      samples.push({
        iter: i,
        ok: false,
        ms: Date.now() - t0,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  return NextResponse.json(
    {
      backend: RATE_LIMIT_BACKEND,
      detectedIp,
      stableKey,
      max: 1000,
      samples,
      firstRemaining: samples[0] && 'remaining' in samples[0] ? samples[0].remaining : null,
      lastRemaining: samples[samples.length - 1] && 'remaining' in samples[samples.length - 1] ? (samples[samples.length - 1] as { remaining?: number }).remaining : null,
      upstashConfigured: !!env.upstash.restUrl.trim() && !!env.upstash.restToken.trim(),
      trustedProxyDepth: env.security.trustedProxyDepth,
      runtimeEnv: {
        VERCEL: process.env.VERCEL ?? null,
        VERCEL_ENV: process.env.VERCEL_ENV ?? null,
        VERCEL_REGION: process.env.VERCEL_REGION ?? null,
      },
    },
    { headers: { 'cache-control': 'no-store, max-age=0' } }
  )
}
