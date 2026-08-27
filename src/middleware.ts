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
 * ## CSP: BLOQUEANTE desde 27/08/2026
 * Nasceu em `Report-Only` porque uma política que nunca rodou quebra terceiros
 * em silêncio — e isso se provou: os primeiros relatórios foram o CDN do Sentry
 * e a analítica da Vercel, depois o Cloudinary (que teria derrubado TODO upload
 * de imagem) e o lookup da App Store. As quatro entraram na allowlist por causa
 * do modo relatório.
 *
 * Três janelas lidas (12/08, 24/08 e 27/08) e a última sobrou com UMA origem:
 * `connect.facebook.net`, 8 eventos, sem pixel do Meta no repo — é o navegador
 * embutido do Instagram injetando o próprio script numa página que não o pede.
 * Bloquear é o comportamento correto, e o dono autorizou.
 *
 * ⚠️ **Rollback é env var, sem deploy: `CSP_ENFORCE=false` na Vercel** volta
 * para Report-Only na hora. O default virou bloqueante de propósito — depender
 * de uma variável ESTAR setada para proteger é a mesma fragilidade que quase
 * derrubou a IA quando o `GOOGLE_GENERATIVE_AI_MODEL_ID` era o único freio.
 * Aqui a env var passou a ser o freio de emergência, não o motor.
 */
import { updateSession } from '@/utils/supabase/middleware'
import { NextRequest, NextResponse } from 'next/server'
import { applySecurityHeaders, buildCspHeader, cspEnforcedFrom } from '@/utils/security/headers'
import { evaluateOriginGuard, originGuardEnforced } from '@/utils/security/originGuard'

/** Bloqueante por padrão; `CSP_ENFORCE=false` é o freio. Regra em `headers.ts`. */
const cspEnforced = () => cspEnforcedFrom(process.env.CSP_ENFORCE)

export async function middleware(request: NextRequest) {
  // ── Guarda de origem para /api/ (SEC-08, auditoria 2026-08-13) ─────────────
  // Branch próprio e BARATO: comparação de headers, zero rede — o motivo de
  // /api/ ficar fora do resto do middleware era o getUser() do updateSession,
  // e ele CONTINUA fora deste caminho. Nasce em modo RELATÓRIO (mesma doutrina
  // do CSP): mismatch vira console.error (retido nos runtime logs da Vercel) e
  // a requisição segue; bloquear exige ORIGIN_GUARD_ENFORCE=true na Vercel,
  // depois de uma janela limpa. Guard: utils/security/__tests__/originGuard.test.ts
  if (request.nextUrl.pathname.startsWith('/api/')) {
    try {
      const verdict = evaluateOriginGuard({
        method: request.method,
        origin: request.headers.get('origin'),
        requestHost: request.nextUrl.host,
        hasSessionCookie: request.cookies.getAll().some((c) => c.name.startsWith('sb-')),
        hasAuthorizationHeader: Boolean(request.headers.get('authorization')),
      })
      if (verdict.action === 'mismatch') {
        console.error(
          '[origin-guard]',
          JSON.stringify({
            kind: verdict.kind,
            originHost: verdict.originHost,
            host: request.nextUrl.host,
            method: request.method,
            path: request.nextUrl.pathname,
            enforced: originGuardEnforced(),
          })
        )
        if (originGuardEnforced()) {
          return NextResponse.json({ ok: false, error: 'origin_mismatch' }, { status: 403 })
        }
      }
    } catch {
      // O que roda em toda chamada de API não pode ter caminho que lance.
    }
    return NextResponse.next()
  }

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
    // NAVEGAÇÃO: renovação de sessão + CSP. `updateSession` faz um `getUser()`
    // (ida à rede) por request — por isso este matcher continua SEM /api/:
    // as 258 rotas autenticam por conta própria (252 verificadas; as outras 6
    // são públicas por desenho ou usam outro mecanismo).
    '/((?!api|_next/static|_next/image|favicon.ico|manifest.json|icone.png|robots.txt|sitemap.xml|auth).*)',
    // API: SÓ a guarda de origem (SEC-08) — comparação de headers, sem rede.
    // O branch de /api/ no topo do middleware retorna antes do updateSession.
    '/api/:path*',
  ],
}
