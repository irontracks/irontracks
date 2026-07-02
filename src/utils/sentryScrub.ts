import type { ErrorEvent } from '@sentry/nextjs'

/**
 * Redação de segredos nos eventos do Sentry (LGPD).
 *
 * Os configs do Sentry usam `stackFrameVariables: true` — ótimo pra debug, mas
 * captura TODAS as variáveis locais de cada frame. Rotas como /api/auth/session
 * têm `access_token`/`refresh_token` como locais; sem redação, um erro nessa
 * rota vazaria credenciais pro Sentry. Este `beforeSend` redige tokens/segredos
 * tanto das MENSAGENS de exceção quanto das VARIÁVEIS locais e breadcrumbs.
 */

// Chaves (de variável/objeto) redigidas por completo.
const SENSITIVE_KEY =
  /(access[_-]?token|refresh[_-]?token|^token$|password|senha|secret|authorization|api[_-]?key|private[_-]?key|client[_-]?secret|bearer|jwt|cpf|cnpj|credit[_-]?card|card[_-]?number|cvv|ssn)/i

/** Redige padrões de token/segredo DENTRO de strings (mensagens, valores). */
function scrubString(s: string): string {
  return s
    // JWT (header.payload.signature começando com eyJ)
    .replace(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+/g, '[redacted-jwt]')
    // Bearer <token>
    .replace(/(bearer\s+)[A-Za-z0-9._~+/-]{10,}=*/gi, '$1[redacted]')
    // access_token=xxx / "refresh_token": "xxx" / api_key: xxx
    .replace(
      /((?:access[_-]?token|refresh[_-]?token|token|password|secret|api[_-]?key)["']?\s*[:=]\s*["']?)[^"'\s,}&)]{6,}/gi,
      '$1[redacted]',
    )
}

function scrubValue(value: unknown, depth = 0): unknown {
  if (depth > 5) return value
  if (typeof value === 'string') return scrubString(value)
  if (Array.isArray(value)) return value.map((v) => scrubValue(v, depth + 1))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY.test(k) ? '[redacted]' : scrubValue(v, depth + 1)
    }
    return out
  }
  return value
}

/** beforeSend: redige segredos do evento. Nunca bloqueia o envio. */
export function scrubSentryEvent<T extends ErrorEvent>(event: T): T {
  try {
    for (const ex of event.exception?.values ?? []) {
      if (typeof ex.value === 'string') ex.value = scrubString(ex.value)
      for (const frame of ex.stacktrace?.frames ?? []) {
        if (frame.vars && typeof frame.vars === 'object') {
          frame.vars = scrubValue(frame.vars) as Record<string, unknown>
        }
      }
    }
    for (const bc of event.breadcrumbs ?? []) {
      if (typeof bc.message === 'string') bc.message = scrubString(bc.message)
      if (bc.data && typeof bc.data === 'object') {
        bc.data = scrubValue(bc.data) as Record<string, unknown>
      }
    }
  } catch {
    // scrub nunca pode bloquear o envio do evento de erro
  }
  return event
}
