import { NextResponse } from 'next/server'
import { z } from 'zod'
import { parseJsonBody } from '@/utils/zod'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getSupabaseCookieOptions } from '@/utils/supabase/cookieOptions'
import { getErrorMessage } from '@/utils/errorMessage'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'

const BodySchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
})

export async function POST(req: Request) {
  try {
    const ip = getRequestIp(req)
    const rl = await checkRateLimitAsync(`auth:session:${ip}`, 10, 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

    const parsed = await parseJsonBody(req, BodySchema)
    if (parsed.response) return parsed.response
    const body = parsed.data!

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json({ ok: false, error: 'missing_env' }, { status: 500 })
    }

    // Capacitor iOS WKWebView sends requests from capacitor:// scheme.
    // Cookies with sameSite:'lax' are blocked as cross-site in that context.
    // When the native header is present we switch to sameSite:'none' so the
    // session cookie is actually stored and sent on subsequent requests.
    const isNativeIos = req.headers.get('x-native-platform') === 'ios'
    const baseCookieOptions = getSupabaseCookieOptions()
    const cookieOptions = isNativeIos
      ? { ...baseCookieOptions, sameSite: 'none' as const, secure: true }
      : baseCookieOptions

    const cookieStore = await cookies()
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookieOptions,
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, { ...(options || {}) })
          })
        },
      },
    })

    const { error } = await supabase.auth.setSession({
      access_token: body.access_token,
      refresh_token: body.refresh_token,
    })
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })

    return NextResponse.json({ ok: true }, { headers: { 'cache-control': 'no-store, max-age=0' } })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}
