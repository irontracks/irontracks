import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseCookieOptions } from '@/utils/supabase/cookieOptions'
import { z } from 'zod'
import { getErrorMessage } from '@/utils/errorMessage'
import { env } from '@/utils/env'
import {
  buildOauthCsrfCookieOptions,
  generateOauthCsrfToken,
  OAUTH_CSRF_MAX_AGE_SECONDS,
} from '@/utils/auth/oauthCsrf'

export const dynamic = 'force-dynamic'

const resolvePublicOrigin = (request: Request) => {
  const isLocalEnv = process.env.NODE_ENV === 'development'
  const envOriginRaw = String(
    process.env.IRONTRACKS_PUBLIC_ORIGIN || process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || '',
  ).trim()
  if (envOriginRaw) {
    try {
      return new URL(envOriginRaw).origin
    } catch {}
  }

  const host = String(request.headers.get('x-forwarded-host') || request.headers.get('host') || '').trim()
  const proto = String(request.headers.get('x-forwarded-proto') || (isLocalEnv ? 'http' : 'https')).trim()
  if (host) {
    const base = `${proto}://${host}`
    return isLocalEnv && base.includes('0.0.0.0') ? base.replace('0.0.0.0', 'localhost') : base
  }

  try {
    const base = new URL(request.url).origin
    return isLocalEnv && base.includes('0.0.0.0') ? base.replace('0.0.0.0', 'localhost') : base
  } catch {
    return isLocalEnv ? 'http://localhost:3000' : 'https://localhost'
  }
}

const QuerySchema = z
  .object({
    next: z
      .preprocess((v) => (typeof v === 'string' ? v : ''), z.string())
      .optional(),
    // Provider must be EXPLICIT — no default. Previously defaulted to 'google'
    // which meant any navigation to /auth/login (even internal redirects from
    // e.g. /wait-approval when session not yet present) dumped the user on the
    // Google OAuth screen. Now missing provider falls through to the landing
    // page handler below.
    provider: z
      .preprocess((v) => (typeof v === 'string' ? v.trim().toLowerCase() : ''), z.enum(['google', 'apple']))
      .optional(),
  })
  .passthrough()

export async function GET(request: Request) {
  const url = new URL(request.url)
  const q = QuerySchema.parse(Object.fromEntries(url.searchParams.entries()))
  const next = q.next ?? '/dashboard'; const provider = q.provider
  const nextCookieName = 'it.auth.next'; const nextCookieMaxAgeSeconds = 60 * 5
  const safeOrigin = resolvePublicOrigin(request)

  // No explicit OAuth provider — send the user to the landing/login page
  // instead of auto-triggering Google OAuth. This prevents server redirects
  // (e.g. /wait-approval → /auth/login) from dumping users on Google's screen.
  if (!provider) {
    const target = new URL('/', safeOrigin)
    if (next && next !== '/dashboard') {
      target.searchParams.set('next', next)
    }
    return NextResponse.redirect(target)
  }

  const supabaseUrl = env.supabase.url; const supabaseAnonKey = env.supabase.anonKey
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.redirect(new URL('/auth/error?error=missing_env', safeOrigin))
  }

  const rawNext = String(next || '/dashboard')
  const safeNext = rawNext.startsWith('/') ? rawNext : '/dashboard'
  const redirectTo = `${safeOrigin}/auth/callback?next=${encodeURIComponent(safeNext)}`
  const baseCookieOptions = getSupabaseCookieOptions()
  const nextCookieExpires = new Date(Date.now() + nextCookieMaxAgeSeconds * 1000)

  let cookiesToApply: Array<{ name: string; value: string; options?: Record<string, unknown> }> = []; const cookieStore = await cookies()

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, { cookieOptions: getSupabaseCookieOptions(), cookies: { getAll() { return cookieStore.getAll() }, setAll(cookiesToSet) { cookiesToApply = cookiesToSet.map((c) => ({ name: c.name, value: c.value, options: c.options ? { ...c.options } : undefined })) } } })

  let oauthUrl: string | null = null
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo },
    })
    if (error) {
      return NextResponse.redirect(new URL(`/auth/error?error=${encodeURIComponent(error.message || 'oauth_failed')}`, safeOrigin))
    }
    oauthUrl = data?.url || null
  } catch (e: unknown) {
    return NextResponse.redirect(new URL(`/auth/error?error=${encodeURIComponent(getErrorMessage(e) || 'oauth_failed')}`, safeOrigin))
  }

  if (!oauthUrl) {
    return NextResponse.redirect(new URL('/auth/error?error=oauth_url_missing', safeOrigin))
  }

  const redirectResp = NextResponse.redirect(oauthUrl)
  cookiesToApply.forEach(({ name, value, options }) => { try { redirectResp.cookies.set(name, value, { ...(options || {}) }) } catch { try { redirectResp.cookies.set(name, value) } catch {} } })
  try { redirectResp.cookies.set(nextCookieName, safeNext, { ...(baseCookieOptions || {}), expires: nextCookieExpires, maxAge: nextCookieMaxAgeSeconds }) } catch { try { redirectResp.cookies.set(nextCookieName, safeNext) } catch {} }

  // Token CSRF de defesa em profundidade. Supabase já valida o state
  // internamente; esse cookie é uma camada extra a ser conferida no
  // callback. Lax + HttpOnly + Secure (produção).
  try {
    const csrfToken = generateOauthCsrfToken()
    const csrfOpts = buildOauthCsrfCookieOptions(csrfToken, process.env.NODE_ENV === 'production')
    redirectResp.cookies.set(csrfOpts.name, csrfOpts.value, {
      httpOnly: csrfOpts.httpOnly,
      secure: csrfOpts.secure,
      sameSite: csrfOpts.sameSite,
      path: csrfOpts.path,
      maxAge: csrfOpts.maxAge,
    })
  } catch { /* não-crítico, fluxo continua */ }
  // Suprime warning de constante não usada em paths antigos
  void OAUTH_CSRF_MAX_AGE_SECONDS

  return redirectResp
}

export async function POST() {
  // Nota: login de email/senha acontece client-side em LoginScreen.tsx
  return NextResponse.json({ ok: false, error: 'use_client_side_login' }, { status: 400, headers: { 'cache-control': 'no-store, max-age=0' } })
}
