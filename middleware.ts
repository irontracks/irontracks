import { updateSession } from '@/utils/supabase/middleware'
import { NextRequest, NextResponse } from 'next/server'
import { applySecurityHeaders, buildCspHeader } from '@/utils/security/headers'

export async function middleware(request: NextRequest) {
  try {
    const hostname = request.nextUrl.hostname
    if (hostname === 'www.irontracks.com.br') {
      const url = request.nextUrl.clone()
      url.hostname = 'irontracks.com.br'
      return NextResponse.redirect(url)
    }
  } catch {}
  const nonce = crypto.randomUUID()
  const isDev = process.env.NODE_ENV === 'development'
  const csp = buildCspHeader(nonce, isDev)
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('content-security-policy', csp)
  requestHeaders.set('x-nonce', nonce)

  const response = await updateSession(request, requestHeaders)
  return applySecurityHeaders(response, nonce, isDev)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|icone.png|robots.txt|sitemap.xml|auth).*)',
  ],
}
