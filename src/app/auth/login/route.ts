import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseCookieOptions } from '@/utils/supabase/cookieOptions'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const sp = url.searchParams
  const next = sp.get('next') ?? '/dashboard'
  const nextCookieName = 'it.auth.next'
  const nextCookieMaxAgeSeconds = 60 * 5

  const originFromUrl = url.origin
  const forwardedHost = (request.headers.get('x-forwarded-host') || '').trim()
  const forwardedProto = (request.headers.get('x-forwarded-proto') || 'https').trim()
  const isLocalEnv = process.env.NODE_ENV === 'development'
  const baseOrigin = forwardedHost && !isLocalEnv ? `${forwardedProto}://${forwardedHost}` : originFromUrl
  let safeOrigin = isLocalEnv && baseOrigin.includes('0.0.0.0') ? baseOrigin.replace('0.0.0.0', 'localhost') : baseOrigin
  if (!isLocalEnv) {
    try {
      const u = new URL(safeOrigin)
      u.protocol = 'https:'
      safeOrigin = u.origin
    } catch {}
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.redirect(new URL('/auth/error?error=missing_env', safeOrigin))
  }

  const rawNext = String(next || '/dashboard')
  const safeNext = rawNext.startsWith('/') ? rawNext : '/dashboard'
  const redirectTo = `${safeOrigin}/auth/callback?next=${encodeURIComponent(safeNext)}`
  const baseCookieOptions = getSupabaseCookieOptions()
  const nextCookieExpires = new Date(Date.now() + nextCookieMaxAgeSeconds * 1000)

  let cookiesToApply: Array<{ name: string; value: string; options?: any }> = []
  const cookieStore = await cookies()

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookieOptions: getSupabaseCookieOptions(),
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToApply = cookiesToSet.map((c) => ({
          name: c.name,
          value: c.value,
          options: c.options ? { ...c.options } : undefined,
        }))
      },
    },
  })

  let oauthUrl: string | null = null
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    })
    if (error) {
      return NextResponse.redirect(
        new URL(`/auth/error?error=${encodeURIComponent(error.message || 'oauth_failed')}`, safeOrigin),
      )
    }
    oauthUrl = data?.url || null
  } catch (e: any) {
    return NextResponse.redirect(
      new URL(`/auth/error?error=${encodeURIComponent(e?.message || 'oauth_failed')}`, safeOrigin),
    )
  }

  if (!oauthUrl) {
    return NextResponse.redirect(new URL('/auth/error?error=oauth_url_missing', safeOrigin))
  }

  const redirectResp = NextResponse.redirect(oauthUrl)
  cookiesToApply.forEach(({ name, value, options }) => {
    try {
      redirectResp.cookies.set(name, value, { ...(options || {}) })
    } catch {
      try {
        redirectResp.cookies.set(name, value)
      } catch {}
    }
  })
  try {
    redirectResp.cookies.set(nextCookieName, safeNext, {
      ...(baseCookieOptions || {}),
      expires: nextCookieExpires,
      maxAge: nextCookieMaxAgeSeconds,
    })
  } catch {
    try {
      redirectResp.cookies.set(nextCookieName, safeNext)
    } catch {}
  }

  return redirectResp
}
