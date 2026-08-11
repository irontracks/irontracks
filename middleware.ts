/**
 * ⚠️ ESTE ARQUIVO NÃO ESTÁ SENDO CARREGADO PELO NEXT (verificado 10/08/2026).
 *
 * As rotas vivem em `src/app/`, e nesse layout o Next só reconhece o middleware
 * em `src/middleware.ts`. Aqui na raiz ele é ignorado em silêncio — sem aviso no
 * build, sem erro. Três provas independentes:
 *   • `.next/server/middleware-manifest.json` → `"middleware": {}`
 *   • um `console.log` no corpo nunca imprime, nem em dev
 *   • `https://www.irontracks.com.br/` responde 200 em vez do 307 para o apex,
 *     que é a PRIMEIRA coisa que este arquivo faria
 * As security headers que se veem nas respostas vêm do `async headers()` do
 * `next.config.ts`, não daqui — foi o que mascarou o problema.
 *
 * Consequência que interessa a quem for mexer: `updateSession()` (a renovação
 * do token do Supabase a cada navegação, o padrão do `@supabase/ssr`) TAMBÉM
 * nunca roda. É suspeita — não confirmada — de ser a razão de sessões morrerem
 * sozinhas e caírem no ricochete de boot corrigido em `lib/auth/bootBounce.ts`.
 *
 * NÃO mova para `src/middleware.ts` de passagem: ativa de uma vez o refresh de
 * sessão, o atalho `/` → `/dashboard` e um CSP com nonce por request, em cima de
 * usuários reais. É mudança de auth + CSP e precisa de decisão do dono.
 */
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
  //
  // ⚠️ O atalho olha só a PRESENÇA do cookie, nunca se ele vale. Isso é de
  // propósito (é o que o torna rápido), mas significa que ele discorda do
  // /dashboard, que confere a sessão de verdade e devolve para
  // `/?next=/dashboard` quando não há usuário. Sem a guarda abaixo os dois se
  // empurram para sempre: um cookie inválido que sobrevive à volta produz
  // `/` → `/dashboard` → `/` → … inteiramente no SERVIDOR, sem um único JS
  // rodando para interromper — e nenhum contador do cliente alcançaria isso.
  //
  // Hoje a guarda é PREVENTIVA: como o arquivo inteiro está inerte (ver o aviso
  // no topo), este loop de servidor não acontece na prática, e o ricochete que
  // de fato prendeu iPhones em ago/2026 foi o do cliente (`it.logged_in`),
  // resolvido em `lib/auth/bootBounce.ts`. Ela existe para o dia em que o
  // middleware for movido para `src/` — sem ela, esse dia liga o atalho e o
  // loop de servidor ao mesmo tempo.
  //
  // `?next=/dashboard` é literalmente o carimbo de "o dashboard acabou de me
  // expulsar". Recebeu esse carimbo, o atalho não se aplica: deixa a raiz
  // renderizar a tela de login, que é o destino correto de quem foi recusado.
  const bouncedFromDashboard = (() => {
    try {
      return String(request.nextUrl.searchParams.get('next') || '').startsWith('/dashboard')
    } catch {
      return false
    }
  })()

  if (request.nextUrl.pathname === '/' && !bouncedFromDashboard) {
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
