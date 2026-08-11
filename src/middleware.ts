/**
 * Middleware global do IronTracks.
 *
 * ## Ele passou 6 meses desligado — leia antes de mexer
 * Nasceu em `src/middleware.ts` em 20/02/2026 (commit de segurança). Em
 * 27/02 um commit de deploy o RENOMEOU para `src/proxy.ts`, desligando-o sem
 * aviso; em 07/03 ele voltou como `middleware.ts` na RAIZ do projeto — e como
 * as rotas vivem em `src/app/`, o Next só reconhece o arquivo em `src/`. Na
 * raiz ele é ignorado **em silêncio**, sem erro e sem aviso no build.
 * Resultado: de 27/02 a 11/08/2026 o app rodou sem renovação de sessão no
 * servidor e **sem CSP nenhum**. O que mascarou foi o `async headers()` do
 * `next.config.ts`, que serve `x-frame-options`/`nosniff`/`referrer-policy`/
 * HSTS — a resposta *parecia* protegida. Detalhes e provas no `CLAUDE.md`.
 *
 * ## O que este arquivo faz hoje, e o que deliberadamente NÃO faz
 * FAZ: renova a sessão do Supabase a cada navegação (`updateSession`, o motivo
 * principal de existir), redireciona `www` → apex e aplica os security headers
 * + CSP.
 *
 * NÃO FAZ o atalho `/` → `/dashboard` que existia na versão da raiz. Ele
 * mandava para o dashboard só por VER um cookie, sem conferir se valia; o
 * dashboard conferia de verdade e devolvia para `/?next=/dashboard`. Era
 * metade do ping-pong que prendeu iPhones piscando na tela de carregamento
 * (ver `lib/auth/bootBounce.ts`). Reativá-lo aqui, no mesmo commit que liga o
 * middleware, seria ressuscitar a armadilha em forma de loop de SERVIDOR — que
 * nenhum contador do cliente alcança, porque nenhum JS chega a rodar. O ganho
 * dele era cosmético (evitar o flash da tela de login) e hoje é redundante: o
 * `useLoginScreen` já faz isso no cliente, e agora conferindo a sessão.
 *
 * ## CSP entra em modo RELATÓRIO
 * Uma política que nunca rodou em produção quebra terceiros em silêncio. Por
 * isso o default é `Content-Security-Policy-Report-Only`: o navegador REPORTA
 * o que bloquearia, sem bloquear nada. As violações caem em
 * `/api/security/csp-report` → Sentry. Depois de uma janela limpa, ligue
 * `CSP_ENFORCE=true` na Vercel — é env var, não precisa de deploy de código.
 */
import { updateSession } from '@/utils/supabase/middleware'
import { NextRequest, NextResponse } from 'next/server'
import { applySecurityHeaders, buildCspHeader } from '@/utils/security/headers'

/**
 * Modo bloqueante só quando explicitamente ligado. O default seguro é relatar:
 * um CSP errado derruba o app inteiro, e este nunca foi exercitado de verdade.
 */
const cspEnforced = () => String(process.env.CSP_ENFORCE || '').toLowerCase() === 'true'

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
  // O Next lê o CSP do header do REQUEST para carimbar o mesmo nonce nos
  // scripts que ele injeta. Sem isto, `script-src 'nonce-…'` bloquearia o
  // próprio framework quando o modo bloqueante for ligado.
  requestHeaders.set('content-security-policy', csp)
  requestHeaders.set('x-nonce', nonce)

  // Cinto e suspensório: `updateSession` já degrada por dentro, mas o que roda
  // em toda navegação não pode ter NENHUM caminho que lance. Um throw aqui é
  // 500 no site inteiro de uma vez — e, como o app nativo carrega o front deste
  // servidor, levaria junto todos os aparelhos já instalados.
  let response: NextResponse
  try {
    response = await updateSession(request, requestHeaders)
  } catch {
    response = NextResponse.next({ request: { headers: requestHeaders } })
  }
  return applySecurityHeaders(response, nonce, isDev, { enforceCsp: cspEnforced() })
}

export const config = {
  matcher: [
    // `/api/` fora do matcher de propósito: `updateSession` faz um `getUser()`
    // (ida à rede) por request, e ligá-lo em 258 rotas de API somaria latência
    // a cada chamada sem ganho — elas já autenticam por conta própria (252 das
    // 258 verificadas; as outras 6 são públicas por desenho ou usam outro
    // mecanismo). O objetivo aqui é renovar a sessão em NAVEGAÇÃO.
    '/((?!api|_next/static|_next/image|favicon.ico|manifest.json|icone.png|robots.txt|sitemap.xml|auth).*)',
  ],
}
