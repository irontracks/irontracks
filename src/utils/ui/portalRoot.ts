/**
 * Onde montar portal de tela cheia (modal, folha, menu flutuante) no app.
 *
 * NUNCA direto no `document.body`. Desde a fase 3 da migração raiz↔/comercial
 * (#1172, 26/09/2026) o `<body>` é compartilhado com a landing e não carrega
 * fonte nem cor do app: a Inter (`--font-inter` + `font-sans`) e o `text-white`
 * moram no contêiner raiz de `app/app/layout.tsx`. Portal no `body` saía FORA
 * dele — e todo menu e janela por portal passou a desenhar em Times, a fonte
 * padrão do navegador (visto no simulador em 27/10/2026: menu do avatar, janela
 * dos destaques do relatório).
 *
 * O contêiner raiz não cria contexto de empilhamento (sem z-index, transform
 * nem overflow), então quem monta aqui escapa dos overlays do app exatamente
 * como escapava no `body` — que é o motivo de existir portal.
 *
 * Fora do app (landing, testes sem o contêiner) cai no `body`.
 */
export const APP_ROOT_ID = 'it-app-root'

export function portalRoot(): HTMLElement {
  return document.getElementById(APP_ROOT_ID) ?? document.body
}
