import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const originFromUrl = url.origin
  const forwardedHost = (request.headers.get('x-forwarded-host') || '').trim()
  const forwardedProto = (request.headers.get('x-forwarded-proto') || 'https').trim()
  const isLocalEnv = process.env.NODE_ENV === 'development'
  const baseOrigin = forwardedHost && !isLocalEnv ? `${forwardedProto}://${forwardedHost}` : originFromUrl
  const safeOrigin = isLocalEnv && baseOrigin.includes('0.0.0.0') ? baseOrigin.replace('0.0.0.0', 'localhost') : baseOrigin

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.redirect(new URL('/', safeOrigin))
  }

  let response = NextResponse.redirect(new URL('/', safeOrigin))

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return []
      },
      setAll(cookiesToSet) {
        response = NextResponse.redirect(new URL('/', safeOrigin))
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, { ...(options || {}) })
        })
      },
    },
  })

  try {
    await supabase.auth.signOut({ scope: 'global' })
  } catch {}

  return response
}

