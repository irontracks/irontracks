import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'
import { applySecurityHeaders, buildCspHeader } from '@/utils/security/headers'

/**
 * Middleware global do IronTracks.
 *
 * Responsabilidades:
 * 1. Atualiza/refesca a sessão Supabase em cada request (necessário para SSR)
 * 2. Bloqueia rotas privadas para usuários não autenticados, redirecionando para /auth/login
 * 3. Permite rotas públicas (auth, webhooks, cron, health, version) sem autenticação
 * 4. Adiciona security headers em todas as respostas (CSP, X-Frame-Options, etc.)
 *
 * Nota: A autenticação fina (role: admin/teacher/user) continua sendo feita
 * dentro de cada route handler via requireUser() / requireRole().
 */

// Prefixos de rotas que NÃO exigem autenticação no middleware
const PUBLIC_PREFIXES = [
  '/auth/',
  '/api/auth/',
  '/api/billing/webhooks/',
  '/api/marketplace/webhooks/',
  '/api/marketplace/health',
  '/api/marketplace/plans',
  '/api/app/plans',
  '/api/cron/',
  '/api/version',
  '/api/supabase/status',
  '/api/errors/report',
  '/api/telemetry/user-event',
  '/api/access-request/create',
  '/_next/',
  '/sw.js',
  '/offline',
  '/manifest.json',
  '/icone.png',
  '/favicon',
  '/icons/',
  '/images/',
]

const isPublicPath = (pathname: string): boolean => {
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

export async function middleware(request: NextRequest) {
  const nonce = crypto.randomUUID()
  const isDev = process.env.NODE_ENV === 'development'
  const csp = buildCspHeader(nonce, isDev)
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('content-security-policy', csp)
  requestHeaders.set('x-nonce', nonce)

  const response = await updateSession(request, requestHeaders)

  const { pathname } = request.nextUrl

  // Rotas públicas: deixa passar sem verificar autenticação
  if (isPublicPath(pathname)) {
    return applySecurityHeaders(response, nonce, isDev)
  }

  // Rotas de API privadas: verifica cookie de sessão
  if (pathname.startsWith('/api/')) {
    const hasAuthCookie = request.cookies.getAll().some((c) => {
      const name = String(c?.name || '')
      return name.startsWith('sb-') && name.includes('auth-token')
    })

    const hasBearer = (() => {
      try {
        const auth = String(request.headers.get('authorization') || '').trim()
        if (!auth) return false
        return /^Bearer\s+\S+$/i.test(auth)
      } catch {
        return false
      }
    })()

    if (!hasAuthCookie && !hasBearer) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    }

    const shouldCheckCsrf = !hasBearer && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(request.method || '').toUpperCase())
    if (shouldCheckCsrf) {
      try {
        const origin = String(request.headers.get('origin') || '').trim()
        const referer = String(request.headers.get('referer') || '').trim()
        const expected = request.nextUrl.origin
        const isSameOrigin = (value: string) => {
          if (!value) return true
          return value.startsWith(expected)
        }
        if ((origin && !isSameOrigin(origin)) || (!origin && referer && !isSameOrigin(referer))) {
          return NextResponse.json({ ok: false, error: 'invalid_origin' }, { status: 403 })
        }
      } catch {
        return NextResponse.json({ ok: false, error: 'invalid_origin' }, { status: 403 })
      }
    }
  }

  return applySecurityHeaders(response, nonce, isDev)
}

export const config = {
  matcher: [
    /*
     * Aplica o middleware em todas as rotas exceto:
     * - Arquivos estáticos do Next.js (_next/static, _next/image)
     * - Favicon
     */
    '/((?!_next/static|_next/image|favicon\\.ico).*)',
  ],
}
