import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseCookieOptions } from '@/utils/supabase/cookieOptions'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const parseOrigin = (raw: any) => {
  try {
    const s = String(raw || '').trim()
    if (!s) return ''
    return new URL(s).origin
  } catch {
    return ''
  }
}

const resolvePublicOrigin = (request: Request) => {
  const isLocalEnv = process.env.NODE_ENV === 'development'
  const envOrigin = parseOrigin(process.env.IRONTRACKS_PUBLIC_ORIGIN || process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL)
  if (envOrigin) return envOrigin
  if (!isLocalEnv) return ''

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
    provider: z
      .preprocess((v) => (typeof v === 'string' ? v.trim().toLowerCase() : ''), z.enum(['google', 'apple']).catch('google')),
  })
  .passthrough()

export async function GET(request: Request) {
  const url = new URL(request.url)
  const spObj: Record<string, string> = {}
  url.searchParams.forEach((value, key) => {
    spObj[key] = value
  })
  const q = QuerySchema.parse(spObj)
  const next = q.next ?? '/dashboard'
  const provider = q.provider
  const nextCookieName = 'it.auth.next'
  const nextCookieMaxAgeSeconds = 60 * 5
  const safeOrigin = resolvePublicOrigin(request)
  if (!safeOrigin) {
    const fallbackOrigin = (() => {
      const isLocalEnv = process.env.NODE_ENV === 'development'
      try {
        const base = new URL(request.url).origin
        return isLocalEnv && base.includes('0.0.0.0') ? base.replace('0.0.0.0', 'localhost') : base
      } catch {
        return isLocalEnv ? 'http://localhost:3000' : 'https://localhost'
      }
    })()
    return NextResponse.redirect(new URL('/auth/error?error=missing_public_origin', fallbackOrigin))
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
