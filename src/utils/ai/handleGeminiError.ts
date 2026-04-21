import { NextResponse } from 'next/server'
import { logError } from '@/lib/logger'
import { getErrorMessage } from '@/utils/errorMessage'

/**
 * Normalize a Google Gemini (@google/generative-ai) error into a NextResponse.
 *
 * The SDK throws errors like:
 *   "[GoogleGenerativeAI Error]: Error fetching from .../generateContent: [429 Too Many Requests] ..."
 * We scan for the HTTP status code embedded in the message and map:
 *
 *   429 → 429 ai_rate_limited  (client should back off + retry)
 *   403 → 503 ai_forbidden      (key/quota/billing issue — server-side problem)
 *   404 → 503 ai_model_missing  (model ID invalid for this API key)
 *   400 → 500 ai_invalid_input  (shouldn't happen if our prompt is well-formed)
 *   5xx → 503 ai_upstream_error (Google-side outage)
 *   other / unknown → 500 ai_error (generic fallback)
 *
 * We intentionally do NOT return Google's raw error string to the client —
 * that can leak model names, project identifiers, or internal prompt content.
 * Full error is always logged server-side for debugging.
 *
 * @param context  Short tag for the log entry (route name, e.g. "chef-ia")
 * @param e        The caught error value (unknown)
 */
export function handleGeminiError(context: string, e: unknown) {
  const raw = getErrorMessage(e) || String(e)
  // Log the full error server-side regardless so we keep diagnostic info
  try {
    logError(`api:ai:${context}`, e)
  } catch {
    // logger failures should never crash the response path
  }

  // Pull the first 3-digit HTTP status between brackets, e.g. "[429 Too Many Requests]"
  const m = raw.match(/\[(\d{3})\b/)
  const upstream = m ? Number(m[1]) : 0

  if (upstream === 429) {
    return NextResponse.json(
      { ok: false, error: 'ai_rate_limited' },
      { status: 429, headers: { 'retry-after': '30' } },
    )
  }
  if (upstream === 403) {
    return NextResponse.json(
      { ok: false, error: 'ai_forbidden' },
      { status: 503 },
    )
  }
  if (upstream === 404) {
    return NextResponse.json(
      { ok: false, error: 'ai_model_missing' },
      { status: 503 },
    )
  }
  if (upstream === 400) {
    return NextResponse.json(
      { ok: false, error: 'ai_invalid_input' },
      { status: 500 },
    )
  }
  if (upstream >= 500 && upstream < 600) {
    return NextResponse.json(
      { ok: false, error: 'ai_upstream_error' },
      { status: 503 },
    )
  }

  // Unknown / non-HTTP error (e.g. JSON parse failure, timeout before HTTP)
  return NextResponse.json(
    { ok: false, error: 'ai_error' },
    { status: 500 },
  )
}

/**
 * Wrapper helper: try a Gemini call, and on failure return a normalized error
 * response instead of letting the exception bubble up as a 500 with raw text.
 *
 * Usage:
 *   const r = await safeGemini('chef-ia', () => model.generateContent(prompt))
 *   if ('errorResponse' in r) return r.errorResponse
 *   const text = r.value.response.text()
 */
export async function safeGemini<T>(
  context: string,
  fn: () => Promise<T>,
): Promise<{ value: T } | { errorResponse: NextResponse }> {
  try {
    const value = await fn()
    return { value }
  } catch (e) {
    return { errorResponse: handleGeminiError(context, e) }
  }
}
