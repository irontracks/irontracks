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

  // Fast-path: se o usuário já tem cookie de sessão e está na raiz, redireciona
  // direto para /dashboard sem esperar getUser() — elimina o flash da tela de login.
  if (request.nextUrl.pathname === '/') {
    try {
      const hasSession = request.cookies.getAll().some((c) => {
        const n = String(c?.name || '')
        return n.startsWith('sb-') || n.includes('supabase')
      })
      if (hasSession) {
        const url = request.nextUrl.clone()
        url.pathname = '/dashboard'
        const redirectRes = NextResponse.redirect(url)
        return applySecurityHeaders(redirectRes, nonce, isDev)
      }
    } catch {}
  }

  const response = await updateSession(request, requestHeaders)
  return applySecurityHeaders(response, nonce, isDev)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|icone.png|robots.txt|sitemap.xml|auth).*)',
  ],
}
