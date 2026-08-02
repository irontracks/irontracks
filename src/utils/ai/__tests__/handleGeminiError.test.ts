import { describe, it, expect, vi } from 'vitest'
import { classifyGeminiError, safeGemini } from '../handleGeminiError'

describe('classifyGeminiError', () => {
  it('maps 429 Too Many Requests to ai_rate_limited', () => {
    const err = new Error(
      '[GoogleGenerativeAI Error]: Error fetching from https://... [429 Too Many Requests] ...',
    )
    expect(classifyGeminiError(err)).toBe('ai_rate_limited')
  })

  it('maps 503 Service Unavailable to ai_upstream_error', () => {
    const err = new Error(
      '[GoogleGenerativeAI Error]: Error fetching from https://.../2.5-flash:generateContent: [503 Service Unavailable] This model is currently experiencing high demand.',
    )
    expect(classifyGeminiError(err)).toBe('ai_upstream_error')
  })

  it('maps 403 Forbidden (billing/quota) to ai_forbidden', () => {
    const err = new Error('[GoogleGenerativeAI Error]: [403 Forbidden]')
    expect(classifyGeminiError(err)).toBe('ai_forbidden')
  })

  it('maps 404 Not Found (bad model) to ai_model_missing', () => {
    const err = new Error('[GoogleGenerativeAI Error]: [404 Not Found]')
    expect(classifyGeminiError(err)).toBe('ai_model_missing')
  })

  it('maps 400 Bad Request to ai_invalid_input', () => {
    const err = new Error('[GoogleGenerativeAI Error]: [400 Bad Request]')
    expect(classifyGeminiError(err)).toBe('ai_invalid_input')
  })

  it('maps AbortError / timeout (no HTTP status) to ai_timeout', () => {
    expect(classifyGeminiError(new Error('Request timeout after 60s'))).toBe('ai_timeout')
    expect(classifyGeminiError(new Error('The operation was aborted'))).toBe('ai_timeout')
  })

  it('maps 5xx generically to ai_upstream_error', () => {
    expect(classifyGeminiError(new Error('[500 Internal Server Error]'))).toBe('ai_upstream_error')
    expect(classifyGeminiError(new Error('[502 Bad Gateway]'))).toBe('ai_upstream_error')
    expect(classifyGeminiError(new Error('[504 Gateway Timeout]'))).toBe('ai_upstream_error')
  })

  it('falls back to ai_error for unclassifiable strings', () => {
    expect(classifyGeminiError(new Error('Something unexpected'))).toBe('ai_error')
    expect(classifyGeminiError('plain string')).toBe('ai_error')
    expect(classifyGeminiError(null)).toBe('ai_error')
  })
})

/**
 * Guard do formato ApiError do SDK atual (@google/genai).
 *
 * Bug real (31/07/2026): a cota DIÁRIA da chave Gemini estourou e a Avaliação
 * por Foto exibiu literalmente "ai_error" na tela. O 429 chegou como JSON
 * (`{"error":{"code":429,…,"status":"RESOURCE_EXHAUSTED"}}`), mas o
 * classificador só entendia o formato antigo `[429 Too Many Requests]` — caiu
 * no default. Valia para TODAS as rotas de IA, não só essa.
 *
 * O payload abaixo é o texto REAL, copiado dos runtime logs da Vercel.
 */
describe('classifyGeminiError — payload JSON do @google/genai', () => {
  const apiError = (code: number, status: string, message = 'boom') =>
    new Error(JSON.stringify({ error: { code, message, status } }))

  it('reconhece o 429 de cota diária que vazou como ai_error em produção', () => {
    const real = new Error(
      '{"error":{"code":429,"message":"You exceeded your current quota, please check your plan and billing details. '
      + 'For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits. '
      + '\\n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, '
      + 'limit: 20, model: gemini-2.5-flash\\nPlease retry in 4.04s.","status":"RESOURCE_EXHAUSTED"}}',
    )
    expect(classifyGeminiError(real)).toBe('ai_rate_limited')
  })

  it('mapeia os demais códigos JSON', () => {
    expect(classifyGeminiError(apiError(403, 'PERMISSION_DENIED'))).toBe('ai_forbidden')
    expect(classifyGeminiError(apiError(404, 'NOT_FOUND'))).toBe('ai_model_missing')
    expect(classifyGeminiError(apiError(400, 'INVALID_ARGUMENT'))).toBe('ai_invalid_input')
    expect(classifyGeminiError(apiError(503, 'UNAVAILABLE'))).toBe('ai_upstream_error')
  })

  it('cai no status gRPC quando não há código numérico', () => {
    expect(classifyGeminiError(new Error('falhou {"status":"RESOURCE_EXHAUSTED"}'))).toBe('ai_rate_limited')
    expect(classifyGeminiError(new Error('falhou {"status":"UNAVAILABLE"}'))).toBe('ai_upstream_error')
  })

  it('status upstream tem precedência sobre a palavra "timeout" no payload', () => {
    // DEADLINE_EXCEEDED vem com "timeout" no texto; antes isso mascarava o 5xx.
    expect(classifyGeminiError(apiError(503, 'UNAVAILABLE', 'upstream timeout'))).toBe('ai_upstream_error')
  })
})

describe('safeGemini', () => {
  it('returns { value } on first-attempt success', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    const r = await safeGemini('test', fn)
    expect('value' in r).toBe(true)
    if ('value' in r) expect(r.value).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries 503 errors up to maxAttempts then returns an errorResponse', async () => {
    const err = new Error('[503 Service Unavailable]')
    const fn = vi.fn().mockRejectedValue(err)
    const r = await safeGemini('test', fn, { maxAttempts: 3, baseDelayMs: 1 })
    expect('errorResponse' in r).toBe(true)
    expect(fn).toHaveBeenCalledTimes(3)
    if ('errorResponse' in r) {
      expect(r.errorResponse.status).toBe(503)
      const body = await r.errorResponse.json()
      expect(body).toEqual({ ok: false, error: 'ai_upstream_error' })
    }
  })

  it('succeeds on 2nd attempt if first fails with 503', async () => {
    const err = new Error('[503 Service Unavailable]')
    const fn = vi.fn()
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce('recovered')
    const r = await safeGemini('test', fn, { maxAttempts: 3, baseDelayMs: 1 })
    expect('value' in r).toBe(true)
    if ('value' in r) expect(r.value).toBe('recovered')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('does NOT retry non-retryable errors (403 forbidden)', async () => {
    const err = new Error('[403 Forbidden]')
    const fn = vi.fn().mockRejectedValue(err)
    const r = await safeGemini('test', fn, { maxAttempts: 3, baseDelayMs: 1 })
    expect('errorResponse' in r).toBe(true)
    expect(fn).toHaveBeenCalledTimes(1) // no retry
  })

  it('does NOT retry 429 rate-limit (client should back off, not the server)', async () => {
    const err = new Error('[429 Too Many Requests]')
    const fn = vi.fn().mockRejectedValue(err)
    const r = await safeGemini('test', fn, { maxAttempts: 3, baseDelayMs: 1 })
    expect('errorResponse' in r).toBe(true)
    expect(fn).toHaveBeenCalledTimes(1)
    if ('errorResponse' in r) {
      expect(r.errorResponse.status).toBe(429)
      expect(r.errorResponse.headers.get('retry-after')).toBe('30')
    }
  })

  it('respects maxAttempts = 1 (disables retry)', async () => {
    const err = new Error('[503 Service Unavailable]')
    const fn = vi.fn().mockRejectedValue(err)
    const r = await safeGemini('test', fn, { maxAttempts: 1, baseDelayMs: 1 })
    expect('errorResponse' in r).toBe(true)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries timeouts as transient failures', async () => {
    const err = new Error('Request aborted')
    const fn = vi.fn()
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce('recovered')
    const r = await safeGemini('test', fn, { maxAttempts: 3, baseDelayMs: 1 })
    expect('value' in r).toBe(true)
    expect(fn).toHaveBeenCalledTimes(2)
  })
})
