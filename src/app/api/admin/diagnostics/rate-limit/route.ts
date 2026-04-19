/**
 * GET /api/_diagnostics/rate-limit
 *
 * Admin-only runtime diagnostic for Finding #54. Returns the actual state
 * of the rate-limit pipeline in production — which backend is active, whether
 * the Upstash env vars are seen by the runtime, and a live ping result.
 *
 * The smoke test scripts/ai-gating-smoke.test.ts sees 60/60 = 400 and zero
 * 429 in burst against /api/ai/exercise-chat even though:
 *   - UPSTASH_REDIS_REST_URL + _TOKEN are configured in Vercel (scope: All)
 *   - The Upstash instance is active (literate-corgi, ~5.7K/10K commands today)
 *
 * So the rate-limit is falling back to memory-per-instance silently. This
 * endpoint pinpoints exactly where.
 *
 * Response shape:
 *   {
 *     backend: 'memory' | 'redis',
 *     upstashEnvSeenByRuntime: { url: boolean, token: boolean },
 *     livePingMs: number | null,
 *     livePingResult: { allowed, remaining, resetAt } | null,
 *     livePingError: string | null,
 *     directFetchStatus: number | null,
 *     directFetchError: string | null,
 *   }
 *
 * After the Finding #54 root cause is understood and fixed, this endpoint
 * can be removed (or gated behind a feature flag).
 */
import { NextResponse } from 'next/server'
import { requireRole } from '@/utils/auth/route'
import { checkRateLimitAsync, RATE_LIMIT_BACKEND } from '@/utils/rateLimit'
import { env } from '@/utils/env'
import { randomBytes } from 'crypto'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request) {
  const auth = await requireRole(['admin'])
  if (!auth.ok) return auth.response

  const urlEnv = env.upstash.restUrl.trim()
  const tokenEnv = env.upstash.restToken.trim()

  const nonceKey = `_diag:${randomBytes(4).toString('hex')}`

  // Trigger the same code path as the rate-limit in production. First call
  // forces the redis branch when envs are set; fallback to memory on fetch
  // failure. After this call, RATE_LIMIT_BACKEND should have flipped to
  // 'redis' if Upstash is reachable.
  let livePingResult = null
  let livePingError: string | null = null
  const t0 = Date.now()
  try {
    livePingResult = await checkRateLimitAsync(nonceKey, 1000, 60_000)
  } catch (e) {
    livePingError = e instanceof Error ? e.message : String(e)
  }
  const livePingMs = Date.now() - t0

  // Second diagnostic: direct fetch against Upstash REST without going through
  // the helper. Isolates whether the issue is fetch-level (DNS, TLS, routing).
  let directFetchStatus: number | null = null
  let directFetchError: string | null = null
  if (urlEnv && tokenEnv) {
    try {
      const r = await fetch(`${urlEnv}/ping`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${tokenEnv}` },
      })
      directFetchStatus = r.status
      // Don't include the body — may leak server identifier. We only want the
      // status code to know if TLS/auth reached Upstash.
    } catch (e) {
      directFetchError = e instanceof Error ? e.message : String(e)
    }
  }

  return NextResponse.json(
    {
      backend: RATE_LIMIT_BACKEND,
      upstashEnvSeenByRuntime: {
        url: !!urlEnv,
        token: !!tokenEnv,
        urlLen: urlEnv.length,
        tokenLen: tokenEnv.length,
      },
      livePingMs,
      livePingResult,
      livePingError,
      directFetchStatus,
      directFetchError,
      runtimeEnv: {
        VERCEL: process.env.VERCEL ?? null,
        VERCEL_ENV: process.env.VERCEL_ENV ?? null,
        VERCEL_REGION: process.env.VERCEL_REGION ?? null,
        NODE_ENV: process.env.NODE_ENV ?? null,
      },
    },
    { headers: { 'cache-control': 'no-store, max-age=0' } }
  )
}
