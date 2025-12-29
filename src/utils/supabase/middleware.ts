import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const redirectWithCookies = (url: URL) => {
    const response = NextResponse.redirect(url)
    try {
      const cookies = supabaseResponse.cookies.getAll()
      try {
        ;(response.cookies as any).setAll?.(cookies)
      } catch {}
      cookies.forEach((cookie) => {
        try {
          response.cookies.set(cookie.name, cookie.value)
        } catch {}
      })
    } catch {}
    return response
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, { ...(options || {}), httpOnly: false })
          )
        },
      },
    }
  )

  let isAuthenticated = false
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    isAuthenticated = Boolean(user?.id)
  } catch {
    isAuthenticated = false
  }

  const pathname = request.nextUrl.pathname

  if (isAuthenticated && pathname === '/') {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return redirectWithCookies(url)
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is. If you're
  // creating a new Response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely!

  return supabaseResponse
}
