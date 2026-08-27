import { NextResponse } from 'next/server'

/** Fonte única do caminho: o CSP aponta para cá e a rota vive neste path. */
export const CSP_REPORT_PATH = '/api/security/csp-report'

/**
 * O CSP bloqueia? Sim, a menos que alguém peça o contrário.
 *
 * A polaridade foi INVERTIDA em 27/08/2026, depois de três janelas em
 * Report-Only (12/08, 24/08, 27/08). Antes era `=== 'true'`: proteger dependia
 * de alguém lembrar de setar a variável, e este repo já sabe onde isso dá — a
 * IA inteira dependeu por meses de o `GOOGLE_GENERATIVE_AI_MODEL_ID` não estar
 * faltando, com o default apontando para um modelo desligado.
 *
 * Só a string exata `false` desliga. Ausente, vazia, `"no"`, `"0"` ou erro de
 * digitação mantêm o bloqueio: numa flag de segurança, o engano tem que cair
 * para o lado seguro. Fica aqui, e não no middleware, para ser testada por
 * COMPORTAMENTO — o source-guard anterior mirava na string `=== 'true'` e
 * envelheceu junto com a decisão que descrevia.
 */
export const cspEnforcedFrom = (valor: string | undefined) =>
  String(valor ?? '').toLowerCase().trim() !== 'false'

export const buildCspHeader = (nonce: string, isDev: boolean) => {
  // Estes dois hosts NÃO são enfeite: com a política rodando em Report-Only,
  // os primeiros relatórios que chegaram foram exatamente `script-src-elem ←
  // browser.sentry-cdn.com` e `← va.vercel-scripts.com`. Em modo bloqueante o
  // app teria perdido o monitoramento de erros e a analítica em silêncio — o
  // tipo de quebra que só aparece semanas depois, quando alguém pergunta por
  // que o Sentry parou de receber.
  const trustedScriptHosts = 'https://browser.sentry-cdn.com https://*.sentry-cdn.com https://va.vercel-scripts.com'
  const scriptSrc = isDev
    ? `'self' 'nonce-${nonce}' 'unsafe-inline' 'unsafe-eval' ${trustedScriptHosts}`
    : `'self' 'nonce-${nonce}' ${trustedScriptHosts}`
  const styleSrc = `'self' 'unsafe-inline' https://fonts.googleapis.com`

  return [
    `default-src 'self'`,
    `script-src ${scriptSrc}`,
    `style-src ${styleSrc}`,
    `style-src-attr 'unsafe-inline'`,
    `font-src 'self' https://fonts.gstatic.com data:`,
    `img-src 'self' data: blob: https://*.googleusercontent.com https://*.supabase.co https://*.supabase.in https://res.cloudinary.com https://i.ytimg.com https://img.youtube.com https://*.basemaps.cartocdn.com https://tile.openstreetmap.org`,
    `media-src 'self' blob: https://*.supabase.co https://*.supabase.in https://res.cloudinary.com`,
    `connect-src 'self' https://*.supabase.co https://*.supabase.in wss://*.supabase.co https://generativelanguage.googleapis.com https://api.mercadopago.com https://www.googleapis.com https://*.basemaps.cartocdn.com https://tile.openstreetmap.org https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://vitals.vercel-insights.com https://api.cloudinary.com https://itunes.apple.com https://res.cloudinary.com`,
    // `res.cloudinary.com` entrou em 14/08/2026 pela SEGUNDA janela de
    // relatorios (4 eventos em 13/08): o preloader do StoryViewer faz fetch
    // com `Range: bytes=0-0` para aquecer as proximas midias, e story em
    // Cloudinary cai no connect-src (img/media ja liberavam a EXIBICAO; o
    // PRELOAD e uma conexao). Guard: __tests__/cspConnectSrc.test.ts
    // `api.cloudinary.com` e `itunes.apple.com` entraram em 12/08/2026 pelos
    // RELATÓRIOS, não por leitura de código: foram as duas unicas violacoes da
    // primeira janela em Report-Only (16 eventos, 24 h). A primeira e o
    // provedor de storage — em modo bloqueante teria caido TODO upload de
    // imagem do app (avaliacao corporal, avatar, story); a segunda e o lookup
    // da App Store que alimenta o aviso de nova versao. Nenhuma das duas
    // aparecia no header antes, e nenhuma teria sido notada sem o modo
    // relatorio — que e exatamente o motivo de ele existir.
    `frame-src 'none'`,
    `frame-ancestors 'none'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `worker-src 'self' blob:`,
    // `report-uri` (e não `report-to`): o público principal é iPhone, e o
    // WebKit ainda só entende esta forma. Sem destino de relatório o modo
    // Report-Only só escreveria no console do aparelho do usuário — invisível
    // para quem precisa decidir se dá para ligar o modo bloqueante.
    `report-uri ${CSP_REPORT_PATH}`,
  ].join('; ')
}

export type SecurityHeaderOptions = {
  /**
   * `false` (default) emite `Content-Security-Policy-Report-Only`: o navegador
   * REPORTA o que bloquearia, sem bloquear nada. É o default porque esta
   * política ficou 6 meses sem rodar em produção (o middleware estava no lugar
   * errado — ver `src/middleware.ts`), então ninguém sabe o que ela derruba.
   * Ligar direto no modo bloqueante arrisca uma tela branca para todo mundo.
   */
  enforceCsp?: boolean
}

export const applySecurityHeaders = (
  response: NextResponse,
  nonce: string,
  isDev: boolean,
  options: SecurityHeaderOptions = {},
) => {
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-XSS-Protection', '1; mode=block')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Permissions-Policy', 'camera=self, microphone=self, geolocation=self, payment=()')
  response.headers.set('X-DNS-Prefetch-Control', 'off')
  response.headers.set('X-Permitted-Cross-Domain-Policies', 'none')
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin-allow-popups')
  // COEP removed: Safari/WKWebView does not support 'credentialless' and
  // 'require-corp' blocks third-party map tiles (CartoDB). The CSP policy
  // already restricts resource loading to whitelisted origins.

  // HSTS is set in vercel.json (source '/(.*)') so it also covers the /auth/*
  // routes, which are excluded from this middleware's matcher. Keeping it here too
  // would emit a duplicate header on the matched routes.

  const header = options.enforceCsp
    ? 'Content-Security-Policy'
    : 'Content-Security-Policy-Report-Only'
  response.headers.set(header, buildCspHeader(nonce, isDev))
  return response
}
