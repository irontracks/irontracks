import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseCookieOptions } from '@/utils/supabase/cookieOptions'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const getAppOrigin = (): string => {
  const env = process.env.NEXT_PUBLIC_APP_URL || process.env.IRONTRACKS_PUBLIC_ORIGIN || ''
  if (env) {
    try { return new URL(env).origin } catch {}
  }
  // Desenvolvimento: fallback para localhost
  if (process.env.NODE_ENV === 'development') {
    return 'http://localhost:3000'
  }
  return ''
}

const QuerySchema = z
  .object({
    next: z
      .preprocess((v) => (typeof v === 'string' ? v : ''), z.string())
      .optional(),
    provider: z
      .preprocess((v) => (typeof v === 'string' ? v.trim().toLowerCase() : ''), z.enum(['google', 'apple']).catch('google')),
  })
  .passthrough()

export async function GET(request: Request) {
  const url = new URL(request.url)
  const q = QuerySchema.parse(Object.fromEntries(url.searchParams.entries()))
  const next = q.next ?? '/dashboard'; const provider = q.provider
  const nextCookieName = 'it.auth.next'; const nextCookieMaxAgeSeconds = 60 * 5
  const safeOrigin = getAppOrigin()
  if (!safeOrigin) {
    return NextResponse.redirect(new URL('/auth/error?error=missing_public_origin', request.url))
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL; const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.redirect(new URL('/auth/error?error=missing_env', safeOrigin))
  }

  const rawNext = String(next || '/dashboard')
  const safeNext = rawNext.startsWith('/') ? rawNext : '/dashboard'
  const redirectTo = `${safeOrigin}/auth/callback?next=${encodeURIComponent(safeNext)}`
  const baseCookieOptions = getSupabaseCookieOptions()
  const nextCookieExpires = new Date(Date.now() + nextCookieMaxAgeSeconds * 1000)

  let cookiesToApply: Array<{ name: string; value: string; options?: any }> = []; const cookieStore = await cookies()

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
  } catch (e: any) {
    return NextResponse.redirect(new URL(`/auth/error?error=${encodeURIComponent(e?.message || 'oauth_failed')}`, safeOrigin))
  }

  if (!oauthUrl) {
    return NextResponse.redirect(new URL('/auth/error?error=oauth_url_missing', safeOrigin))
  }

  const redirectResp = NextResponse.redirect(oauthUrl)
  cookiesToApply.forEach(({ name, value, options }) => { try { redirectResp.cookies.set(name, value, { ...(options || {}) }) } catch { try { redirectResp.cookies.set(name, value) } catch {} } })
  try { redirectResp.cookies.set(nextCookieName, safeNext, { ...(baseCookieOptions || {}), expires: nextCookieExpires, maxAge: nextCookieMaxAgeSeconds }) } catch { try { redirectResp.cookies.set(nextCookieName, safeNext) } catch {} }

  return redirectResp
}

export async function POST() {
  // Nota: login de email/senha acontece client-side em LoginScreen.tsx
  return NextResponse.json({ ok: false, error: 'use_client_side_login' }, { status: 400, headers: { 'cache-control': 'no-store, max-age=0' } })
}
