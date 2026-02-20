import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'

/**
 * Middleware global do IronTracks.
 *
 * Responsabilidades:
 * 1. Atualiza/refesca a sessão Supabase em cada request (necessário para SSR)
 * 2. Bloqueia rotas privadas para usuários não autenticados, redirecionando para /auth/login
 * 3. Permite rotas públicas (auth, webhooks, cron, health, version) sem autenticação
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

export async function middleware(request: NextRequest) {
  // Sempre atualiza a sessão Supabase (necessário para SSR funcionar)
  const response = await updateSession(request)

  const { pathname } = request.nextUrl

  // Rotas públicas: deixa passar sem verificar autenticação
  if (isPublicPath(pathname)) return response

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

  return response
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
