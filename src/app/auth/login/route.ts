import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const sp = url.searchParams
  const next = sp.get('next') ?? '/dashboard'

  const originFromUrl = url.origin
  const forwardedHost = (request.headers.get('x-forwarded-host') || '').trim()
  const forwardedProto = (request.headers.get('x-forwarded-proto') || 'https').trim()
  const isLocalEnv = process.env.NODE_ENV === 'development'
  const baseOrigin = forwardedHost && !isLocalEnv ? `${forwardedProto}://${forwardedHost}` : originFromUrl
  const safeOrigin = isLocalEnv && baseOrigin.includes('0.0.0.0') ? baseOrigin.replace('0.0.0.0', 'localhost') : baseOrigin

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.redirect(new URL('/auth/auth-code-error?error=missing_env', safeOrigin))
  }

  const rawNext = String(next || '/dashboard')
  const safeNext = rawNext.startsWith('/') ? rawNext : '/dashboard'
  const redirectTo = `${safeOrigin}/auth/callback?next=${encodeURIComponent(safeNext)}`

  let cookiesToApply: Array<{ name: string; value: string; options?: any }> = []

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return []
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
        new URL(`/auth/auth-code-error?error=${encodeURIComponent(error.message || 'oauth_failed')}`, safeOrigin),
      )
    }
    oauthUrl = data?.url || null
  } catch (e: any) {
    return NextResponse.redirect(
      new URL(`/auth/auth-code-error?error=${encodeURIComponent(e?.message || 'oauth_failed')}`, safeOrigin),
    )
  }

  if (!oauthUrl) {
    return NextResponse.redirect(new URL('/auth/auth-code-error?error=oauth_url_missing', safeOrigin))
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

  return redirectResp
}
