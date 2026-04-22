import { describe, it, expect } from 'vitest'
import { translateAiError, AI_GENERIC_FALLBACK } from '../clientErrors'

describe('translateAiError', () => {
  it('maps canonical ai_rate_limited to pt-BR friendly message', () => {
    const msg = translateAiError('ai_rate_limited')
    expect(msg).toMatch(/tentativas|aguarde/i)
    expect(msg).not.toContain('ai_rate_limited')
  })

  it('maps canonical ai_upstream_error to pt-BR friendly message', () => {
    const msg = translateAiError('ai_upstream_error')
    expect(msg).toMatch(/Google|instabilidade|alguns minutos/i)
    expect(msg).not.toContain('ai_upstream_error')
  })

  it('maps canonical ai_forbidden to pt-BR friendly message', () => {
    const msg = translateAiError('ai_forbidden')
    expect(msg).toMatch(/cota|billing|time foi avisado/i)
  })

  it('strips raw Google SDK error with 503 status', () => {
    const raw =
      '[GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/2.5-flash:generateContent: [503 Service Unavailable] This model is currently experiencing high demand.'
    const msg = translateAiError(raw)
    // Should never leak the URL or the bracketed status
    expect(msg).not.toContain('generativelanguage')
    expect(msg).not.toContain('503')
    expect(msg).not.toContain('GoogleGenerativeAI')
    expect(msg).toMatch(/Google|instabilidade/i)
  })

  it('strips raw Google SDK error with 429 status', () => {
    const raw = '[GoogleGenerativeAI Error]: [429 Too Many Requests]'
    const msg = translateAiError(raw)
    expect(msg).not.toContain('429')
    expect(msg).toMatch(/tentativas|aguarde/i)
  })

  it('returns generic fallback for unknown strings (defense against internal leaks)', () => {
    expect(translateAiError('some weird server error')).toBe(AI_GENERIC_FALLBACK)
    expect(translateAiError('TypeError: foo is not a function')).toBe(AI_GENERIC_FALLBACK)
  })

  it('returns generic fallback for null / undefined / empty', () => {
    expect(translateAiError(null)).toBe(AI_GENERIC_FALLBACK)
    expect(translateAiError(undefined)).toBe(AI_GENERIC_FALLBACK)
    expect(translateAiError('')).toBe(AI_GENERIC_FALLBACK)
    expect(translateAiError('   ')).toBe(AI_GENERIC_FALLBACK)
  })

  it('falls back to upstream message for GoogleGenerativeAI errors with no status', () => {
    const raw = '[GoogleGenerativeAI Error]: Unknown failure'
    const msg = translateAiError(raw)
    expect(msg).not.toContain('GoogleGenerativeAI')
    expect(msg).toMatch(/Google|instabilidade/i)
  })

  it('handles code embedded in wrapper text', () => {
    // Sometimes an outer catch wraps the code: "Error: ai_rate_limited"
    const msg = translateAiError('Error: ai_rate_limited')
    expect(msg).toMatch(/tentativas|aguarde/i)
  })

  it('all messages are pt-BR (sanity check, no raw English leaks)', () => {
    const codes = [
      'ai_rate_limited',
      'ai_forbidden',
      'ai_model_missing',
      'ai_invalid_input',
      'ai_upstream_error',
      'ai_timeout',
      'ai_error',
    ]
    for (const code of codes) {
      const msg = translateAiError(code)
      // Every message should contain accented/ptBR words or portuguese pattern
      expect(msg.length).toBeGreaterThan(20)
      expect(msg).not.toMatch(/please|try again|error\b/i)
    }
  })
})
