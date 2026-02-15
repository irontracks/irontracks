import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { getSupabaseCookieOptions } from '@/utils/supabase/cookieOptions'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

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
    code: z.preprocess((v) => (typeof v === 'string' ? v.trim() : ''), z.string()).optional(),
    next: z.preprocess((v) => (typeof v === 'string' ? v : ''), z.string()).optional(),
    type: z.preprocess((v) => (typeof v === 'string' ? v.trim().toLowerCase() : ''), z.string()).optional(),
    error: z.preprocess((v) => (typeof v === 'string' ? v.trim() : ''), z.string()).optional(),
    error_description: z.preprocess((v) => (typeof v === 'string' ? v.trim() : ''), z.string()).optional(),
  })
  .passthrough()

export async function GET(request: Request) {
  const url = new URL(request.url)
  const spObj: Record<string, string> = {}
  url.searchParams.forEach((value, key) => {
    spObj[key] = value
  })
  const q = QuerySchema.parse(spObj)

  const code = q.code || ''
  const next = q.next ?? ''
  const type = q.type || ''
  const errorParam = q.error
  const errorDescription = q.error_description
  const nextCookieName = 'it.auth.next'
  const safeOrigin = resolvePublicOrigin(request)

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
    const cookieStore = await cookies()
    nextFromCookie = String(cookieStore.get(nextCookieName)?.value || '')
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

  if (type === 'recovery') {
    const u = new URL('/auth/recovery', safeOrigin)
    u.searchParams.set('code', code)
    u.searchParams.set('next', safeNext)
    u.searchParams.set('type', 'recovery')
    return NextResponse.redirect(u)
  }

  const cookieStore = await cookies()

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookieOptions: getSupabaseCookieOptions(),
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          try {
            response.cookies.set(name, value, { ...(options || {}) })
          } catch {
            try {
              response.cookies.set(name, value)
            } catch {}
          }
        })
      },
    },
  })

  try {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      const msg = String(error.message || '').toLowerCase()
      if (
        msg.includes('code challenge') ||
        msg.includes('code verifier') ||
        msg.includes('pkce') ||
        msg.includes('flow_state_not_found')
      ) {
        return NextResponse.redirect(new URL('/auth/error?error=pkce_failed', safeOrigin))
      }
      return NextResponse.redirect(new URL(`/auth/error?error=${encodeURIComponent(error.message || 'exchange_failed')}`, safeOrigin))
    }
    try {
      await supabase.auth.getUser()
    } catch {}
  } catch {
    return NextResponse.redirect(new URL('/auth/error?error=exchange_failed', safeOrigin))
  }

  return response
}

