import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseCookieOptions } from '@/utils/supabase/cookieOptions'

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

export async function GET(request: Request) {
  const url = new URL(request.url)
  const sp = url.searchParams
  const next = sp.get('next') ?? '/dashboard'
  const providerRaw = String(sp.get('provider') || '').trim().toLowerCase()
  const provider = providerRaw === 'apple' ? 'apple' : 'google'
  const nextCookieName = 'it.auth.next'
  const nextCookieMaxAgeSeconds = 60 * 5
  const safeOrigin = resolvePublicOrigin(request)

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
      provider,
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
