import type { CookieOptions } from '@supabase/ssr'

export function getSupabaseCookieOptions(): CookieOptions {
  const nodeEnv = String(process.env.NODE_ENV || '').toLowerCase()
  const isProd = nodeEnv === 'production'

  const forcedDomain = String(process.env.SUPABASE_COOKIE_DOMAIN || '').trim()

  const siteUrl = String(process.env.NEXT_PUBLIC_SITE_URL || '').trim()
  const host = (() => {
    try {
      if (!siteUrl) return ''
      return new URL(siteUrl).hostname
    } catch {
      return ''
    }
  })()
  const isIronTracksDomain = host === 'irontracks.com.br' || host.endsWith('.irontracks.com.br')

  const cookieDomain = forcedDomain ? forcedDomain : isProd && isIronTracksDomain ? '.irontracks.com.br' : undefined

  return {
    domain: cookieDomain,
    path: '/',
    sameSite: 'lax',
    secure: isProd,
  }
}
