import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import { getSupabaseCookieOptions } from '@/utils/supabase/cookieOptions'
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'
  const errorParam = searchParams.get('error')
  const errorDescription = searchParams.get('error_description')

  const originFromUrl = new URL(request.url).origin
  const forwardedHost = request.headers.get('x-forwarded-host')
  const forwardedProto = request.headers.get('x-forwarded-proto') || 'https'
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
  const rawNext = String(next || '/dashboard')
  const safeNext = rawNext.startsWith('/') ? rawNext : '/dashboard'
  const redirectUrl = new URL(safeNext, safeOrigin)

  let response = NextResponse.redirect(redirectUrl)

  const rawError = String(errorDescription || errorParam || '').trim()
  if (rawError && !code) {
    return NextResponse.redirect(
      new URL(`/auth/error?error=${encodeURIComponent(rawError)}`, safeOrigin),
    )
  }

  if (!code) {
    return NextResponse.redirect(new URL('/auth/error?error=missing_code', safeOrigin))
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.redirect(new URL('/auth/error?error=missing_env', safeOrigin))
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookieOptions: getSupabaseCookieOptions(),
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, { ...(options || {}) })
          })
        },
      },
    }
  )

  try {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      return NextResponse.redirect(
        new URL(`/auth/error?error=${encodeURIComponent(error.message || 'exchange_failed')}`, safeOrigin)
      )
    }
  } catch (e) {
    return NextResponse.redirect(new URL('/auth/error?error=exchange_failed', safeOrigin))
  }

  return response
}
