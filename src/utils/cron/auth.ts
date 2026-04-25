import { hasValidInternalSecret } from '@/utils/auth/route'
import { env } from '@/utils/env'

/**
 * Authorize a Vercel Cron invocation. Vercel Cron sends the Authorization
 * header `Bearer <CRON_SECRET>`. We also allow internal secret callers
 * (useful for manual triggering during development).
 */
export function isCronAuthorized(req: Request): boolean {
  const authHeader = req.headers.get('authorization')
  if (authHeader === `Bearer ${env.security.cronSecret}`) return true
  if (hasValidInternalSecret(req)) return true
  return false
}
