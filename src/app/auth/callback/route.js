import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import { getSupabaseCookieOptions } from '@/utils/supabase/cookieOptions'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? ''
  const errorParam = searchParams.get('error')
  const errorDescription = searchParams.get('error_description')
  const nextCookieName = 'it.auth.next'
  const setCookieNames = []

  const originFromUrl = new URL(request.url).origin
  const url = new URL(request.url)
  const hostHeader = String(request.headers.get('host') || '').trim()
  const forwardedHost = String(request.headers.get('x-forwarded-host') || '').trim()
  const forwardedProto = String(request.headers.get('x-forwarded-proto') || '').trim()
  const isLocalEnv = process.env.NODE_ENV === 'development'
  const protoFromUrl = String(url.protocol || '').replace(':', '')
  const effectiveProto = forwardedProto || protoFromUrl || (isLocalEnv ? 'http' : 'https')
  const baseOrigin =
    isLocalEnv && (hostHeader || url.host)
      ? `${effectiveProto}://${hostHeader || url.host}`
      : forwardedHost && !isLocalEnv
        ? `${effectiveProto}://${forwardedHost}`
        : originFromUrl
  let safeOrigin = isLocalEnv && baseOrigin.includes('0.0.0.0') ? baseOrigin.replace('0.0.0.0', 'localhost') : baseOrigin
  const configuredOriginRaw = String(process.env.IRONTRACKS_PUBLIC_ORIGIN || '').trim()
  if (configuredOriginRaw) {
    try {
      safeOrigin = new URL(configuredOriginRaw).origin
    } catch {}
  }
  if (!isLocalEnv) {
    try {
      const u = new URL(safeOrigin)
      u.protocol = 'https:'
      safeOrigin = u.origin
    } catch {}
  }

  const rawError = String(errorDescription || errorParam || '').trim()
  if (rawError && !code) {
    return NextResponse.redirect(new URL(`/auth/error?error=${encodeURIComponent(rawError)}`, safeOrigin))
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.redirect(new URL('/auth/error?error=missing_env', safeOrigin))
  }

  let nextFromCookie = ''
  try {
    nextFromCookie = String(request.cookies.get(nextCookieName)?.value || '')
  } catch {}
  const rawNext = String(next || '')
  const fallbackNext = nextFromCookie || '/dashboard'
  const safeNext = rawNext.startsWith('/') ? rawNext : fallbackNext.startsWith('/') ? fallbackNext : '/dashboard'
  const redirectUrl = new URL(safeNext, safeOrigin)

  let response = NextResponse.redirect(redirectUrl)
  try {
    response.cookies.set(nextCookieName, '', { path: '/', maxAge: 0 })
  } catch {}

  if (!code) {
    return NextResponse.redirect(new URL('/auth/error?error=missing_code', safeOrigin))
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookieOptions: getSupabaseCookieOptions(),
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          try {
            setCookieNames.push(String(name || ''))
          } catch {}
          response.cookies.set(name, value, { ...(options || {}) })
        })
      },
    },
  })

  try {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      return NextResponse.redirect(new URL(`/auth/error?error=${encodeURIComponent(error.message || 'exchange_failed')}`, safeOrigin))
    }
    try {
      await supabase.auth.getUser()
    } catch {}
  } catch (e) {
    return NextResponse.redirect(new URL('/auth/error?error=exchange_failed', safeOrigin))
  }

  try {
    if (process.env.NODE_ENV === 'development') {
      const uniq = Array.from(new Set(setCookieNames.filter(Boolean))).sort()
      response.headers.set('x-it-set-cookie-names', uniq.join(',').slice(0, 900))
    }
  } catch {}

  return response
}
