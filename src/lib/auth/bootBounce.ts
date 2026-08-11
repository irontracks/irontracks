/**
 * @module bootBounce
 *
 * Freio de ricochete do boot — fonte ÚNICA da contagem de idas e voltas entre
 * `/` e `/dashboard`.
 *
 * ## O sintoma (ago/2026, relatado por usuária real de iPhone)
 * O app abria e ficava PISCANDO na tela de carregamento, sem nunca entrar. A
 * única saída era desinstalar e reinstalar.
 *
 * ## A causa
 * Ping-pong entre dois lados que discordavam sobre a sessão:
 *   • `/` mandava para `/dashboard` porque a marca local `it.logged_in` dizia
 *     "este aparelho está logado" — marca que é gravada no login e que NADA no
 *     app apagava, nem quando o servidor recusava a sessão. Ela não expira.
 *   • `/dashboard` devolvia para `/?next=/dashboard` porque a sessão real (o
 *     cookie) estava inválida ou porque o `userId` não hidratou em 3 s.
 * Cada volta era uma navegação completa: a página nascia de novo, mostrava o
 * splash e ricocheteava. Medido em produção: um documento novo a cada ~5 s,
 * indefinidamente.
 *
 * O salva-vidas que existia — o botão "Voltar ao início" do `LoadingScreen`
 * depois de 8 s — era INALCANÇÁVEL justamente aqui: o componente morria a cada
 * volta e o cronômetro reiniciava do zero antes de chegar aos 8 s. Por isso o
 * contador deste módulo vive no STORAGE, não em `useState`/`useRef`: ele
 * precisa sobreviver à recarga que ele existe para detectar.
 *
 * ## A regra
 * Passou de `MAX_BOUNCES` voltas dentro de `BOUNCE_WINDOW_MS`, quem ia
 * redirecionar NÃO redireciona. Vale para a CLASSE do problema: qualquer causa
 * futura de ping-pong (não só `it.logged_in`) morre em duas voltas em vez de
 * prender o usuário para sempre.
 *
 * ## Fronteira deliberada: o freio NUNCA derruba a sessão
 * Ao estourar, só a marca de atalho (`it.logged_in`) é apagada — nunca os
 * cookies `sb-*`. Um dos caminhos do loop acontece com sessão PERFEITAMENTE
 * VÁLIDA (o dashboard expulsa por lentidão na hidratação do `userId`); limpar
 * cookies ali deslogaria um usuário legítimo por causa de uma conexão ruim.
 * Apagar `it.logged_in` não desloga ninguém: é atalho de UI, a sessão de
 * verdade mora no cookie.
 */

export const BOUNCE_KEY = 'it.boot.bounce.v1'
export const BOUNCE_WINDOW_MS = 30_000
export const MAX_BOUNCES = 2

/** A marca de atalho gravada no login. Não é credencial — a sessão é o cookie. */
export const LOGGED_IN_KEY = 'it.logged_in'

export type BounceState = { t: number; c: number }
export type BounceResult = { count: number; tripped: boolean }

/** Subconjunto de `Storage` que este módulo usa — facilita o teste. */
export type BounceStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/**
 * `sessionStorage` preferido (o contador morre junto com a aba, que é o escopo
 * certo de um boot), com queda para `localStorage` porque o WKWebView do iOS
 * bloqueia `sessionStorage` em algumas configurações de privacidade — e é
 * exatamente no iOS que o bug aparece. Mesmo padrão já usado no `recovery.js`.
 */
export const getBounceStorage = (): BounceStorage | null => {
  try {
    if (typeof window === 'undefined') return null
  } catch {
    return null
  }
  try {
    const s = window.sessionStorage
    if (s) {
      // Alguns WebViews expõem o objeto e lançam só no acesso.
      s.getItem(BOUNCE_KEY)
      return s
    }
  } catch { /* cai para localStorage */ }
  try {
    const l = window.localStorage
    if (l) {
      l.getItem(BOUNCE_KEY)
      return l
    }
  } catch { /* sem storage nenhum */ }
  return null
}

/** Formato serializado: `"<timestamp>|<contagem>"`. Entrada corrompida vira zerada. */
export const parseBounce = (raw: string | null): BounceState => {
  const parts = String(raw ?? '').split('|')
  const t = Number(parts[0])
  const c = Number(parts[1])
  return {
    t: Number.isFinite(t) && t > 0 ? t : 0,
    c: Number.isFinite(c) && c > 0 ? c : 0,
  }
}

export const serializeBounce = (state: BounceState): string => `${state.t}|${state.c}`

/**
 * Conta mais uma volta e diz se estourou.
 *
 * Sem storage devolve `tripped: false`: não dá para contar o que não persiste, e
 * travar o redirecionamento por precaução prenderia na tela de login quem está
 * apenas com o storage bloqueado. Esse cenário é coberto pelo outro lado da
 * correção — o middleware, que não reaplica o atalho `/` → `/dashboard` quando
 * a volta vem carimbada com `?next=/dashboard`.
 */
export const registerBounce = (store: BounceStorage | null, now: number): BounceResult => {
  if (!store) return { count: 0, tripped: false }
  let state: BounceState = { t: 0, c: 0 }
  try {
    state = parseBounce(store.getItem(BOUNCE_KEY))
  } catch { /* leitura falhou: começa do zero */ }

  // `t` é o INÍCIO da janela e é preservado enquanto ela vale — não o instante
  // da última volta. Carimbar `t = now` a cada volta faria a janela deslizar e
  // nunca fechar: bastaria uma volta a cada 29 s, para sempre, para a contagem
  // seguir subindo e o freio disparar num app saudável.
  const withinWindow = state.t > 0 && now - state.t < BOUNCE_WINDOW_MS
  const next: BounceState = withinWindow
    ? { t: state.t, c: state.c + 1 }
    : { t: now, c: 1 }

  try {
    store.setItem(BOUNCE_KEY, serializeBounce(next))
  } catch { /* best effort: a decisão abaixo ainda vale para esta volta */ }

  return { count: next.c, tripped: next.c > MAX_BOUNCES }
}

/** Lê sem contar — para quem só quer saber se houve ricochete recente. */
export const readBounce = (store: BounceStorage | null, now: number): BounceResult => {
  if (!store) return { count: 0, tripped: false }
  let state: BounceState = { t: 0, c: 0 }
  try {
    state = parseBounce(store.getItem(BOUNCE_KEY))
  } catch {
    return { count: 0, tripped: false }
  }
  if (!(state.t > 0) || now - state.t >= BOUNCE_WINDOW_MS) return { count: 0, tripped: false }
  return { count: state.c, tripped: state.c > MAX_BOUNCES }
}

/**
 * Zera o contador. Chamado quando o boot dá certo (dashboard com `userId`) —
 * sem isso, no fallback de `localStorage` as voltas de sessões diferentes se
 * somariam e o freio pegaria um boot saudável.
 */
export const resetBounce = (store: BounceStorage | null): void => {
  if (!store) return
  try {
    store.removeItem(BOUNCE_KEY)
  } catch { /* best effort */ }
}

/** Resposta do `/api/auth/ping`: 204 = viva, 401 = morta, falha de rede = ignorada. */
export type PingResult = 'alive' | 'dead' | 'unknown'

export type BootDecision =
  /** Sessão confirmada pelo servidor: pode subir para o /dashboard. */
  | 'enter'
  /** Sem sessão (ou ricocheteando): fica na raiz e mostra o login. */
  | 'show-login'
  /** Servidor inalcançável: sobe assim mesmo, como antes desta correção. */
  | 'enter-optimistic'

/**
 * Decide o que a raiz faz quando encontra a marca `it.logged_in`.
 *
 * Antes desta correção a resposta era sempre "sobe" — confiança cega numa marca
 * que nunca expira. Daí o loop.
 *
 * `unknown` (o `fetch` rejeitou) NÃO é tratado como "sem sessão": estar sem rede
 * é o caso normal de quem abre o app no vestiário da academia, e derrubar essas
 * pessoas para a tela de login seria trocar um bug por outro. Quem sobe otimista
 * e ricocheteia acaba pego pelo contador, que é justamente a rede de segurança.
 *
 * `tripped` vence tudo: se já ricocheteou demais, nem o `alive` faz subir — um
 * `ping` respondendo 204 enquanto o dashboard expulsa é exatamente o formato do
 * segundo caminho do loop (sessão válida, `userId` que não hidrata a tempo).
 */
export const decideBootRedirect = (input: { tripped: boolean; ping: PingResult }): BootDecision => {
  if (input.tripped) return 'show-login'
  if (input.ping === 'alive') return 'enter'
  if (input.ping === 'dead') return 'show-login'
  return 'enter-optimistic'
}

/**
 * Rompe o loop: apaga o crachá vencido para que o PRÓXIMO boot já nasça na tela
 * de login em vez de ricochetear de novo. Ver a fronteira no cabeçalho — os
 * cookies `sb-*` ficam intactos de propósito.
 */
export const clearBoundLoginMark = (): void => {
  try {
    if (typeof window === 'undefined') return
    window.localStorage.removeItem(LOGGED_IN_KEY)
  } catch { /* best effort */ }
}
