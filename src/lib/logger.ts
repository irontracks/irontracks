/**
 * Logger centralizado — suprime logs em produção para não vazar dados sensíveis.
 * Use logInfo/logWarn/logError em vez de console.log direto.
 *
 * logError também REPORTA ao Sentry (server + client). Antes, nenhum logError
 * chegava lá — os erros de produção ficavam só no console.error (efêmero, não
 * pesquisável nem alertável). logInfo/logWarn continuam só console (não-fatais).
 */

import * as Sentry from '@sentry/nextjs'

const IS_PROD = process.env.NODE_ENV === 'production'

const SENSITIVE_KEYS = new Set([
  'password', 'senha', 'token', 'secret', 'authorization', 'access_token',
  'refresh_token', 'api_key', 'apikey', 'private_key', 'credit_card',
  'card_number', 'cvv', 'ssn', 'cpf', 'cnpj',
])

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[truncated]'
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map((v) => sanitize(v, depth + 1))
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEYS.has(k.toLowerCase()) ? '[redacted]' : sanitize(v, depth + 1)
  }
  return out
}


/**
 * Em função SERVERLESS, `captureException` só ENFILEIRA — a Vercel congela a
 * instância assim que a resposta sai, e o evento morre no buffer sem nunca
 * chegar ao Sentry. Era a causa do gap "o Sentry não recebe erros de rota
 * server" (documentado no CLAUDE.md e sofrido a sessão inteira de 01/08):
 * mesma classe da promessa órfã que atrasou o push de aprovação em 13 min.
 *
 * `flush` inicia o envio JÁ, e o `waitUntil` da Vercel segura a instância viva
 * até completar. Import dinâmico: este logger também roda no BROWSER, onde
 * `@vercel/functions` não existe — lá o SDK envia sozinho e nada disso é
 * necessário. Fora da Vercel (dev, testes), o catch silencioso deixa o flush
 * async normal seguir.
 */
function scheduleServerFlush() {
  if (typeof window !== 'undefined') return
  try {
    const flushing = Sentry.flush(2000).catch(() => { })
    void import('@vercel/functions')
      .then((m) => { try { m.waitUntil?.(flushing) } catch { /* fora da Vercel */ } })
      .catch(() => { /* fora da Vercel */ })
  } catch { /* reporting nunca pode quebrar a aplicação */ }
}

export function logInfo(context: string, message: string, extra?: unknown) {
  if (IS_PROD) return
  const ts = new Date().toISOString()
  console.log(`[INFO ${ts}] ${context}: ${message}`, extra !== undefined ? sanitize(extra) : '')
}

export function logWarn(context: string, message: string, extra?: unknown) {
  if (IS_PROD) return
  const ts = new Date().toISOString()
  console.warn(`[WARN ${ts}] ${context}: ${message}`, extra !== undefined ? sanitize(extra) : '')
}

/**
 * Texto do erro para o log e para o Sentry.
 *
 * O supabase-js devolve erro como OBJETO SIMPLES (`{ message, code, details,
 * hint }`), não como `Error` — e `String(obj)` dá `"[object Object]"`. Foi assim
 * que o Sentry recebeu `hook:useWorkoutDeload.fetchReportHistory: [object
 * Object]` (JAVASCRIPT-NEXTJS-22) sem dizer o que falhou. Vale para todo
 * `logError` que recebe o `{ error }` de uma consulta.
 */
export function mensagemDoErro(error: unknown): string {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object') {
    const o = error as Record<string, unknown>
    const partes = [o.message, o.code ? `code=${o.code}` : '', o.details, o.hint]
      .map((v) => (typeof v === 'string' ? v.trim() : ''))
      .filter(Boolean)
    if (partes.length) return partes.join(' · ').slice(0, 500)
    try { return JSON.stringify(sanitize(error)).slice(0, 500) } catch { /* cai no String abaixo */ }
  }
  return String(error)
}

/** Parece um erro de verdade (não um objeto de dados como `{ userId }`)? */
function pareceErro(v: unknown): boolean {
  if (v instanceof Error) return true
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return typeof o.message === 'string' || '__isAuthError' in o || (typeof o.code === 'string' && 'details' in o)
}

export function logError(context: string, error: unknown, extra?: unknown) {
  // ~120 chamadas usam a ordem (contexto, "texto", erro) — o texto caía no lugar
  // do erro e o erro real ia parar no `extra`, então o Sentry recebia só
  // "error: FirstAccess Send Error:" (JAVASCRIPT-NEXTJS-1E) sem dizer o que
  // falhou. Em vez de reescrever 120 chamadas (várias em login e checkout),
  // o logger reconhece a forma: texto + algo que parece erro → o erro é o 3º.
  const trocado = typeof error === 'string' && pareceErro(extra)
  const erroReal = trocado ? extra : error
  const descricao = trocado ? (error as string).trim() : ''
  const extraReal = trocado ? undefined : extra

  // Erros sempre logados — essenciais para debugging em prod
  const ts = new Date().toISOString()
  const msg = descricao ? `${descricao} ${mensagemDoErro(erroReal)}`.trim() : mensagemDoErro(erroReal)
  console.error(`[ERROR ${ts}] ${context}: ${msg}`, extraReal !== undefined ? sanitize(extraReal) : erroReal)

  // Reporta ao Sentry (server + client). `context` vira tag pra filtrar; `extra`
  // (sanitizado, sem dados sensíveis) vira contexto. Valores não-Error viram um
  // Error sintético com o contexto pra agrupar bem. O try/catch garante que uma
  // falha do reporting nunca quebre o fluxo da aplicação.
  try {
    Sentry.captureException(erroReal instanceof Error ? erroReal : new Error(`${context}: ${msg}`), {
      tags: { logContext: context },
      ...(extraReal !== undefined || descricao
        ? { extra: { ...(extraReal !== undefined ? { detail: sanitize(extraReal) } : {}), ...(descricao ? { descricao } : {}) } }
        : {}),
    })
    scheduleServerFlush()
  } catch {
    // reporting nunca pode quebrar a aplicação
  }
}

export function logDebug(context: string, message: string, extra?: unknown) {
  if (IS_PROD) return
  const ts = new Date().toISOString()
  console.log(`[DEBUG ${ts}] ${context}: ${message}`, extra !== undefined ? sanitize(extra) : '')
}

/**
 * logWarnRemote — como logWarn, mas TAMBÉM reporta ao Sentry (nível `warning`).
 *
 * Para sinais DIAGNÓSTICOS raros que precisam ser pesquisáveis/alertáveis em
 * produção sem serem tratados como erro fatal — ex.: "flight-recorder" de um bug
 * intermitente que não reproduz em dev. Diferente de `logWarn` (só console) e de
 * `logError` (captura como exception). O try/catch garante que o reporting nunca
 * quebre o fluxo da aplicação.
 */
export function logWarnRemote(context: string, message: string, extra?: unknown) {
  const ts = new Date().toISOString()
  if (!IS_PROD) console.warn(`[WARN* ${ts}] ${context}: ${message}`, extra !== undefined ? sanitize(extra) : '')
  try {
    Sentry.captureMessage(`${context}: ${message}`, {
      level: 'warning',
      tags: { logContext: context },
      ...(extra !== undefined ? { extra: { detail: sanitize(extra) } } : {}),
    })
    scheduleServerFlush()
  } catch {
    // reporting nunca pode quebrar a aplicação
  }
}
