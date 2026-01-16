import type { CookieOptions } from '@supabase/ssr'

export function getSupabaseCookieOptions(): CookieOptions {
  const nodeEnv = String(process.env.NODE_ENV || '').toLowerCase()
  const vercelEnv = String(process.env.VERCEL_ENV || '').toLowerCase()
  const isVercelProd = vercelEnv === 'production'
  const isProd = nodeEnv === 'production'

  const cookieDomain = isProd && isVercelProd ? '.irontracks.com.br' : undefined

  return {
    domain: cookieDomain,
    path: '/',
    sameSite: 'lax',
    secure: isProd,
  }
}

