/**
 * Client-side translation of AI error codes into friendly pt-BR messages.
 *
 * Server routes wrapped with `safeGemini` / `handleGeminiError` always return
 * a canonical code in `{ ok: false, error: 'ai_*' }`. This module turns that
 * code into something the user can read.
 *
 * Why a separate helper:
 *   - Every AI feature needs the same mapping (insights, coach chat,
 *     meal plan, etc.). Duplicating the switch in each component rots fast.
 *   - The raw Google SDK error string ("[GoogleGenerativeAI Error] ...")
 *     used to leak into the UI. A catch-all in this helper also covers the
 *     case where a pre-migration route still returns a raw error.
 */

import { AI_ERROR_KNOWN_CODES, type AiErrorCode } from './errorCodes'

/** Known server-emitted codes (duplicated here for runtime guard). */
const KNOWN_CODES = AI_ERROR_KNOWN_CODES

const PT_BR_MESSAGES: Record<AiErrorCode, string> = {
  ai_rate_limited:
    'Muitas tentativas em sequência. Aguarde alguns segundos e tente novamente.',
  ai_forbidden:
    'A chave da IA está com problema (cota ou billing). Já avisamos o time — tente novamente mais tarde.',
  ai_model_missing:
    'O modelo de IA configurado não está disponível. O time foi avisado.',
  ai_invalid_input:
    'Os dados enviados não puderam ser processados pela IA. Tente novamente ou contate o suporte.',
  ai_upstream_error:
    'O serviço de IA da Google está com instabilidade temporária. Tente novamente em alguns minutos.',
  ai_timeout:
    'A IA demorou demais pra responder. Tente novamente em alguns segundos.',
  ai_error:
    'Não foi possível gerar a resposta da IA agora. Tente novamente em alguns segundos.',
}

/** Default fallback message when nothing else matches. */
export const AI_GENERIC_FALLBACK =
  'Não foi possível gerar a resposta da IA agora. Tente novamente em alguns segundos.'

/**
 * Return a friendly pt-BR message for an AI error. Accepts:
 *   - A canonical code ('ai_rate_limited', ...)
 *   - A raw Google SDK error string ('[GoogleGenerativeAI Error] ...')
 *   - Any other string (generic fallback)
 *   - null/undefined (generic fallback)
 *
 * Never returns the original input verbatim — this is the last guard against
 * raw internal errors leaking to production UI.
 */
export function translateAiError(input: unknown): string {
  if (!input) return AI_GENERIC_FALLBACK
  const str = typeof input === 'string' ? input : String(input)
  const trimmed = str.trim()
  if (!trimmed) return AI_GENERIC_FALLBACK

  // Canonical code → direct lookup
  if (KNOWN_CODES.has(trimmed as AiErrorCode)) {
    return PT_BR_MESSAGES[trimmed as AiErrorCode]
  }

  // Known code wrapped in a longer string (defensive: "Error: ai_rate_limited")
  for (const code of KNOWN_CODES) {
    if (trimmed.includes(code)) return PT_BR_MESSAGES[code]
  }

  // Raw Google SDK leak — try to classify by HTTP status in the brackets
  const statusMatch = trimmed.match(/\[(\d{3})\b/)
  if (statusMatch) {
    const status = Number(statusMatch[1])
    if (status === 429) return PT_BR_MESSAGES.ai_rate_limited
    if (status === 403) return PT_BR_MESSAGES.ai_forbidden
    if (status === 404) return PT_BR_MESSAGES.ai_model_missing
    if (status === 400) return PT_BR_MESSAGES.ai_invalid_input
    if (status >= 500 && status < 600) return PT_BR_MESSAGES.ai_upstream_error
  }

  // Google SDK error prefix but unclassifiable HTTP status
  if (/GoogleGenerativeAI|generativelanguage\.googleapis/i.test(trimmed)) {
    return PT_BR_MESSAGES.ai_upstream_error
  }

  // Everything else → hide the internals
  return AI_GENERIC_FALLBACK
}
