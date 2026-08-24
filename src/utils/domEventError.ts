/**
 * @module domEventError
 *
 * Traduz um **DOM `Event`** que chegou onde se esperava um `Error`.
 *
 * O caso que originou (24/08/2026, produção, iPhone/WKWebView): o Sentry
 * recebeu `Event \`Event\` (type=error) captured as promise rejection` em
 * `/dashboard`, sem stack e sem mensagem — ou seja, uma Promise foi rejeitada
 * com o EVENTO de erro (`img.onerror`, `FileReader.onerror`, `<video>`…) em vez
 * de um `Error`. O título não diz o que falhou nem onde, então o evento chega
 * ilegível e ninguém consegue agir: foi exatamente o que aconteceu.
 *
 * Um `Event` não carrega mensagem nem pilha, mas carrega o ALVO — e o alvo diz
 * quase tudo (`<img>` com a URL, `<video>` com o `MediaError`, `FileReader`).
 * É isso que este módulo extrai.
 *
 * Duas frentes usam daqui:
 *  - `sentry.client.config.ts` (`beforeSend`) — enriquece e reagrupa o evento,
 *    para o PRÓXIMO já chegar acionável;
 *  - `ErrorReporterProvider` — o diálogo do app mostrava `[object Event]` ao
 *    usuário (`getErrorMessage` cai em `String(error)`).
 *
 * Quem REJEITA deve continuar passando `Error` (`reject(new Error(...))`) — o
 * guard `src/__tests__/promiseNuncaRejeitaComEvento.test.ts` cobra isso. Este
 * módulo é a rede embaixo, para o que vem de dependência ou do runtime.
 */

export type DomEventErrorInfo = {
  /** `error`, `abort`… — o `type` do evento. */
  type: string
  /** Tag do alvo em maiúsculas (`IMG`, `VIDEO`, `SCRIPT`) ou o construtor (`FileReader`). */
  target: string
  /** URL do recurso que falhou, quando o alvo tem uma. */
  src: string
  /** Mensagem do `MediaError`/`FileReader.error`, quando existe. */
  reason: string
}

const asRecord = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === 'object' ? (v as Record<string, unknown>) : null

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/** Códigos do `MediaError` — o número sozinho não diz nada em um título. */
const MEDIA_ERROR_LABEL: Record<number, string> = {
  1: 'MEDIA_ERR_ABORTED',
  2: 'MEDIA_ERR_NETWORK',
  3: 'MEDIA_ERR_DECODE',
  4: 'MEDIA_ERR_SRC_NOT_SUPPORTED',
}

/**
 * `true` para o que anda como Event: tem `type` string e (`target` ou
 * `currentTarget`). Não usa `instanceof Event` de propósito — o objeto pode vir
 * de outro realm (iframe) e, no servidor, `Event` pode nem existir.
 */
export function isDomEventLike(value: unknown): boolean {
  const rec = asRecord(value)
  if (!rec) return false
  if (value instanceof Error) return false
  if (typeof rec.type !== 'string' || !rec.type) return false
  return 'target' in rec || 'currentTarget' in rec || 'isTrusted' in rec
}

/** Extrai o que dá para saber do evento. `null` quando não é um Event. */
export function describeDomEvent(value: unknown): DomEventErrorInfo | null {
  if (!isDomEventLike(value)) return null
  const ev = asRecord(value)
  if (!ev) return null

  const targetRec = asRecord(ev.target) ?? asRecord(ev.currentTarget)
  let target = ''
  let src = ''
  let reason = ''

  if (targetRec) {
    target = str(targetRec.tagName).toUpperCase()
    if (!target) {
      // FileReader, XMLHttpRequest, IDBRequest… não têm tagName.
      const ctor = asRecord(targetRec.constructor)
      target = str(ctor?.name)
    }
    // `currentSrc` vem primeiro: num `<video>` com vários `<source>`, é ele que
    // diz QUAL arquivo o navegador tentou de fato.
    src = str(targetRec.currentSrc) || str(targetRec.src) || str(targetRec.href)

    const mediaError = asRecord(targetRec.error)
    if (mediaError) {
      const code = Number(mediaError.code)
      reason = str(mediaError.message) || (Number.isFinite(code) ? MEDIA_ERROR_LABEL[code] || `code ${code}` : '')
    }
  }

  return { type: str(ev.type) || 'event', target: target || 'desconhecido', src, reason }
}

/** Só o host + arquivo: a URL inteira estoura o título e pode levar query com token. */
export function shortenResourceUrl(url: string): string {
  const raw = str(url)
  if (!raw) return ''
  if (raw.startsWith('data:')) return 'data:'
  if (raw.startsWith('blob:')) return 'blob:'
  try {
    const u = new URL(raw)
    const file = u.pathname.split('/').filter(Boolean).pop() || '/'
    return `${u.host}/${file}`
  } catch {
    return raw.slice(0, 80)
  }
}

/**
 * Título para o Sentry e para o log. Fica estável por ALVO (não pela URL
 * inteira), para o agrupamento não explodir em um issue por arquivo.
 */
export function domEventErrorTitle(info: DomEventErrorInfo): string {
  const parts = [`Falha de recurso (${info.target})`]
  if (info.type && info.type !== 'error') parts.push(`evento "${info.type}"`)
  if (info.reason) parts.push(info.reason)
  const url = shortenResourceUrl(info.src)
  if (url) parts.push(url)
  return parts.join(' · ')
}

/**
 * Mensagem para o USUÁRIO. Vazia quando não há nada de concreto a dizer —
 * `[object Event]` num diálogo modal não ajuda ninguém e treina a fechar aviso
 * sem ler.
 */
export function domEventUserMessage(info: DomEventErrorInfo): string {
  const url = shortenResourceUrl(info.src)
  if (!url && info.target === 'desconhecido') return ''
  const alvo = url || info.target
  return `Não foi possível carregar um recurso do app (${alvo}). Verifique sua conexão e tente novamente.`
}
