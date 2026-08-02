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

export function logError(context: string, error: unknown, extra?: unknown) {
  // Erros sempre logados — essenciais para debugging em prod
  const ts = new Date().toISOString()
  const msg = (error instanceof Error) ? error.message : String(error)
  console.error(`[ERROR ${ts}] ${context}: ${msg}`, extra !== undefined ? sanitize(extra) : error)

  // Reporta ao Sentry (server + client). `context` vira tag pra filtrar; `extra`
  // (sanitizado, sem dados sensíveis) vira contexto. Valores não-Error viram um
  // Error sintético com o contexto pra agrupar bem. O try/catch garante que uma
  // falha do reporting nunca quebre o fluxo da aplicação.
  try {
    Sentry.captureException(error instanceof Error ? error : new Error(`${context}: ${msg}`), {
      tags: { logContext: context },
      ...(extra !== undefined ? { extra: { detail: sanitize(extra) } } : {}),
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
