/**
 * Guard do SEC-10 (auditoria 2026-08-13): o fallback de rate limit em memória
 * precisa se ANUNCIAR em produção via logError — logWarn é no-op em prod e a
 * Vercel só retém nível error, então o modo memória rodava invisível (medido
 * em 14/08/2026: zero registros do aviso em 23 h de runtime logs).
 *
 * Fiação, não reimplementação: importa o módulo REAL (rateLimitLogic.test.ts
 * cobre o algoritmo com uma cópia injetável; aqui o que importa é o sinal).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/logger', () => ({ logError: vi.fn(), logWarn: vi.fn() }))

const NODE_ENV_ORIGINAL = process.env.NODE_ENV

describe('modo memória do rate limit se anuncia (SEC-10)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })
  afterEach(() => {
    process.env.NODE_ENV = NODE_ENV_ORIGINAL
  })

  it('em produção, a primeira checagem em modo memória dispara logError', async () => {
    process.env.NODE_ENV = 'production'
    const { logError, logWarn } = await import('@/lib/logger')
    const { checkRateLimit, RATE_LIMIT_BACKEND } = await import('@/utils/rateLimit')
    expect(RATE_LIMIT_BACKEND, 'teste pressupõe ambiente sem Upstash').toBe('memory')

    checkRateLimit('sec10:teste', 5, 60_000)

    expect(vi.mocked(logError)).toHaveBeenCalledWith(
      'rateLimit:memory-fallback',
      expect.any(Error)
    )
    expect(vi.mocked(logWarn)).not.toHaveBeenCalled()
  })

  it('fora de produção continua logWarn (dev não polui o Sentry)', async () => {
    process.env.NODE_ENV = 'test'
    const { logError, logWarn } = await import('@/lib/logger')
    const { checkRateLimit } = await import('@/utils/rateLimit')

    checkRateLimit('sec10:teste-dev', 5, 60_000)

    expect(vi.mocked(logWarn)).toHaveBeenCalled()
    expect(vi.mocked(logError)).not.toHaveBeenCalled()
  })

  it('o sinal é one-shot por instância — não vira spam', async () => {
    process.env.NODE_ENV = 'production'
    const { logError } = await import('@/lib/logger')
    const { checkRateLimit } = await import('@/utils/rateLimit')

    checkRateLimit('sec10:a', 5, 60_000)
    checkRateLimit('sec10:b', 5, 60_000)
    checkRateLimit('sec10:c', 5, 60_000)

    expect(vi.mocked(logError)).toHaveBeenCalledTimes(1)
  })
})
