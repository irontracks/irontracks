import type { CookieOptions } from '@supabase/ssr'
import { env } from '@/utils/env'

export function getSupabaseCookieOptions(): CookieOptions {
  const nodeEnv = String(process.env.NODE_ENV || '').toLowerCase()
  const isProd = nodeEnv === 'production'

  const forcedDomain = env.supabase.cookieDomain.trim()
  const cookieDomain = forcedDomain ? forcedDomain : undefined
  const maxAgeSeconds = 60 * 60 * 24 * 30
  const expiresAt = new Date(Date.now() + maxAgeSeconds * 1000)

  return {
    domain: cookieDomain,
    path: '/',
    sameSite: 'lax',
    secure: isProd,
    expires: expiresAt,
    maxAge: maxAgeSeconds,
  }
}
