import { NextResponse } from 'next/server'
import { logError, logWarn } from '@/lib/logger'
import { getErrorMessage } from '@/utils/errorMessage'
import type { AiErrorCode } from './errorCodes'

export type { AiErrorCode }

/**
 * Codes that are worth retrying transparently. Everything else indicates a
 * problem the retry won't solve (bad input, missing model, billing, etc.).
 */
const RETRYABLE_CODES: ReadonlySet<AiErrorCode> = new Set(['ai_upstream_error', 'ai_timeout'])

/**
 * Map a raw Gemini SDK / fetch error to one of our canonical codes.
 * Does NOT build a NextResponse — use `handleGeminiError` for that.
 */
export function classifyGeminiError(e: unknown): AiErrorCode {
  const raw = getErrorMessage(e) || String(e)
  // Timeout from our AbortController / fetch
  if (/aborted|timeout/i.test(raw) && !/\[\d{3}\b/.test(raw)) return 'ai_timeout'

  // Pull the first 3-digit HTTP status between brackets, e.g. "[429 Too Many Requests]"
  const m = raw.match(/\[(\d{3})\b/)
  const upstream = m ? Number(m[1]) : 0

  if (upstream === 429) return 'ai_rate_limited'
  if (upstream === 403) return 'ai_forbidden'
  if (upstream === 404) return 'ai_model_missing'
  if (upstream === 400) return 'ai_invalid_input'
  if (upstream >= 500 && upstream < 600) return 'ai_upstream_error'
  return 'ai_error'
}

/**
 * Normalize a Google Gemini error into a NextResponse with a CANONICAL code.
 *
 * The client never sees Google's raw error string — that can leak model names,
 * project identifiers, or internal prompt content. The full error is always
 * logged server-side for debugging.
 */
export function handleGeminiError(context: string, e: unknown) {
  // Log the full error server-side regardless so we keep diagnostic info
  try {
    logError(`api:ai:${context}`, e)
  } catch {
    // logger failures should never crash the response path
  }

  const code = classifyGeminiError(e)

  switch (code) {
    case 'ai_rate_limited':
      return NextResponse.json(
        { ok: false, error: 'ai_rate_limited' },
        { status: 429, headers: { 'retry-after': '30' } },
      )
    case 'ai_forbidden':
      return NextResponse.json({ ok: false, error: 'ai_forbidden' }, { status: 503 })
    case 'ai_model_missing':
      return NextResponse.json({ ok: false, error: 'ai_model_missing' }, { status: 503 })
    case 'ai_invalid_input':
      return NextResponse.json({ ok: false, error: 'ai_invalid_input' }, { status: 500 })
    case 'ai_upstream_error':
      return NextResponse.json({ ok: false, error: 'ai_upstream_error' }, { status: 503 })
    case 'ai_timeout':
      return NextResponse.json({ ok: false, error: 'ai_timeout' }, { status: 504 })
    default:
      return NextResponse.json({ ok: false, error: 'ai_error' }, { status: 500 })
  }
}

export interface SafeGeminiOptions {
  /**
   * Max attempts across transient failures. Default 3 (one initial + two retries).
   * Set to 1 to disable retry.
   */
  maxAttempts?: number
  /**
   * Base delay in ms for exponential backoff. Default 500.
   * Delay between retries is `baseDelayMs * 2^(attempt-1)` plus jitter.
   */
  baseDelayMs?: number
}

/**
 * Wait `ms` milliseconds — with a small random jitter to avoid thundering
 * herd when many users retry simultaneously.
 */
function sleep(ms: number): Promise<void> {
  const jitter = Math.floor(Math.random() * 150)
  return new Promise((r) => setTimeout(r, ms + jitter))
}

/**
 * Run a Gemini call with automatic retry for transient upstream failures
 * (503, 504, timeouts). Non-retryable errors short-circuit.
 *
 * On final failure returns `{ errorResponse }` — a fully-formed NextResponse
 * that the route handler should `return` as-is.
 *
 * Usage:
 *   const r = await safeGemini('post-workout-insights', () =>
 *     model.generateContent(prompt),
 *   )
 *   if ('errorResponse' in r) return r.errorResponse
 *   const text = r.value.response.text()
 */
export async function safeGemini<T>(
  context: string,
  fn: () => Promise<T>,
  options: SafeGeminiOptions = {},
): Promise<{ value: T } | { errorResponse: NextResponse }> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3)
  const baseDelayMs = Math.max(0, options.baseDelayMs ?? 500)

  let lastError: unknown = null
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const value = await fn()
      return { value }
    } catch (e) {
      lastError = e
      const code = classifyGeminiError(e)
      const isLast = attempt === maxAttempts
      const isRetryable = RETRYABLE_CODES.has(code)

      if (isLast || !isRetryable) break

      const delay = baseDelayMs * Math.pow(2, attempt - 1)
      try {
        logWarn(
          `api:ai:${context}`,
          `Transient Gemini failure (${code}). Retry ${attempt}/${maxAttempts - 1} in ~${delay}ms`,
        )
      } catch {
        // logger failures never crash the retry loop
      }
      await sleep(delay)
    }
  }

  return { errorResponse: handleGeminiError(context, lastError) }
}
