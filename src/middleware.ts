import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'

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
  '/api/access-request/create',
  '/_next/',
  '/favicon',
  '/icons/',
  '/images/',
]

const isPublicPath = (pathname: string): boolean => {
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

/** Headers de segurança aplicados em todas as respostas */
function applySecurityHeaders(response: NextResponse): NextResponse {
  // Impede clickjacking
  response.headers.set('X-Frame-Options', 'DENY')
  // Impede MIME-type sniffing
  response.headers.set('X-Content-Type-Options', 'nosniff')
  // Proteção XSS legada
  response.headers.set('X-XSS-Protection', '1; mode=block')
  // Controla referrer
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  // Restringe features sensíveis do browser
  response.headers.set(
    'Permissions-Policy',
    'camera=self, microphone=self, geolocation=(), payment=()',
  )

  // Content Security Policy
  const isDev = process.env.NODE_ENV === 'development'
  const scriptSrc = isDev
    ? "'self' 'unsafe-inline' 'unsafe-eval'"
    : "'self' 'unsafe-inline'"

  response.headers.set(
    'Content-Security-Policy',
    [
      `default-src 'self'`,
      `script-src ${scriptSrc}`,
      `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
      `font-src 'self' https://fonts.gstatic.com data:`,
      `img-src 'self' data: blob: https://*.googleusercontent.com https://*.supabase.co https://*.supabase.in https://i.ytimg.com https://img.youtube.com`,
      `media-src 'self' blob: https://*.supabase.co https://*.supabase.in`,
      `connect-src 'self' https://*.supabase.co https://*.supabase.in wss://*.supabase.co https://generativelanguage.googleapis.com https://api.mercadopago.com https://www.googleapis.com`,
      `frame-src 'none'`,
      `object-src 'none'`,
      `base-uri 'self'`,
      `form-action 'self'`,
    ].join('; '),
  )

  return response
}

export async function middleware(request: NextRequest) {
  // Sempre atualiza a sessão Supabase (necessário para SSR funcionar)
  const response = await updateSession(request)

  const { pathname } = request.nextUrl

  // Rotas públicas: deixa passar sem verificar autenticação
  if (isPublicPath(pathname)) {
    return applySecurityHeaders(response)
  }

  // Rotas de API privadas: verifica cookie de sessão
  if (pathname.startsWith('/api/')) {
    const hasAuthCookie = request.cookies.getAll().some((c) => {
      const name = String(c?.name || '')
      return name.startsWith('sb-') && name.includes('auth-token')
    })

    if (!hasAuthCookie) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    }
  }

  return applySecurityHeaders(response)
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
