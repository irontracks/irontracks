import { hasValidInternalSecret } from '@/utils/auth/route'
import { env } from '@/utils/env'

/**
 * Constant-time string comparison. A naïve `a === b` short-circuits at the
 * first differing byte, so an attacker can measure latency to recover the
 * secret byte by byte. We compare in O(n) by XOR-summing all positions.
 */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return mismatch === 0
}

/**
 * Authorize a Vercel Cron invocation. Vercel Cron sends the Authorization
 * header `Bearer <CRON_SECRET>`. We also allow internal secret callers
 * (useful for manual triggering during development).
 */
export function isCronAuthorized(req: Request): boolean {
  const expected = env.security.cronSecret.trim()
  if (!expected) return false
  const authHeader = req.headers.get('authorization') ?? ''
  if (authHeader.startsWith('Bearer ') && safeEqual(authHeader.slice(7), expected)) return true
  if (hasValidInternalSecret(req)) return true
  return false
}
