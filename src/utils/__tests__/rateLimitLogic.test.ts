import { describe, it, expect, beforeEach } from 'vitest'

// ────────────────────────────────────────────────────────────────────────────
// Lógica pura extraída de src/utils/rateLimit.ts
// Testamos o algoritmo de rate limiting in-memory isoladamente.
// ────────────────────────────────────────────────────────────────────────────

type Entry = { count: number; resetAt: number }
type Store = Map<string, Entry>

interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
  retryAfterSeconds: number
}

/**
 * Versão injetável do checkRateLimit para testes
 * (sem depender do globalThis compartilhado entre workers)
 */
const checkRateLimitWith = (
  store: Store,
  key: string,
  max: number,
  windowMs: number,
  now: number = Date.now(),
): RateLimitResult => {
  const existing = store.get(key)
  if (!existing || now >= existing.resetAt) {
    const resetAt = now + windowMs
    store.set(key, { count: 1, resetAt })
    return { allowed: true, remaining: max - 1, resetAt, retryAfterSeconds: 0 }
  }
  const newCount = existing.count + 1
  store.set(key, { ...existing, count: newCount })
  if (newCount > max) {
    const retryAfterSeconds = Math.ceil((existing.resetAt - now) / 1000)
    return { allowed: false, remaining: 0, resetAt: existing.resetAt, retryAfterSeconds }
  }
  return { allowed: true, remaining: max - newCount, resetAt: existing.resetAt, retryAfterSeconds: 0 }
}

/**
 * Versão injetável do compactLocalStore para testes
 */
const compactLocalStore = (store: Store, now: number = Date.now()): number => {
  let removed = 0
  for (const [key, entry] of store.entries()) {
    if (now >= entry.resetAt) {
      store.delete(key)
      removed++
    }
  }
  return removed
}

// ────────────────────────────────────────────────────────────────────────────

describe('checkRateLimit (in-memory)', () => {
  let store: Store

  beforeEach(() => {
    store = new Map()
  })

  const NOW = 1_700_000_000_000 // timestamp fixo para testes
  const WINDOW = 60_000 // 60s
  const MAX = 5

  describe('primeiro request', () => {
    it('é permitido com remaining = max-1', () => {
      const result = checkRateLimitWith(store, 'user:abc', MAX, WINDOW, NOW)
      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(MAX - 1)
      expect(result.retryAfterSeconds).toBe(0)
    })

    it('cria entrada na store', () => {
      checkRateLimitWith(store, 'user:abc', MAX, WINDOW, NOW)
      expect(store.has('user:abc')).toBe(true)
    })
  })

  describe('requests dentro do limite', () => {
    it('permite todos até o máximo', () => {
      for (let i = 0; i < MAX; i++) {
        const result = checkRateLimitWith(store, 'user:abc', MAX, WINDOW, NOW + i)
        expect(result.allowed).toBe(true)
      }
    })

    it('remaining decresce a cada request', () => {
      const results: number[] = []
      for (let i = 0; i < MAX; i++) {
        const { remaining } = checkRateLimitWith(store, 'user:abc', MAX, WINDOW, NOW + i)
        results.push(remaining)
      }
      for (let i = 0; i < results.length - 1; i++) {
        expect(results[i]).toBeGreaterThan(results[i + 1])
      }
    })
  })

  describe('requests além do limite', () => {
    it('bloqueia o request (max+1)-ésimo', () => {
      for (let i = 0; i <= MAX; i++) {
        checkRateLimitWith(store, 'user:abc', MAX, WINDOW, NOW + i)
      }
      const over = checkRateLimitWith(store, 'user:abc', MAX, WINDOW, NOW + MAX + 1)
      expect(over.allowed).toBe(false)
      expect(over.remaining).toBe(0)
      expect(over.retryAfterSeconds).toBeGreaterThan(0)
    })
  })

  describe('reset após expiração da janela', () => {
    it('permite novamente após a janela expirar', () => {
      // Esgota o limite
      for (let i = 0; i <= MAX; i++) {
        checkRateLimitWith(store, 'user:abc', MAX, WINDOW, NOW + i)
      }
      // Avança o tempo além da janela
      const afterWindow = checkRateLimitWith(store, 'user:abc', MAX, WINDOW, NOW + WINDOW + 1_000)
      expect(afterWindow.allowed).toBe(true)
      expect(afterWindow.remaining).toBe(MAX - 1)
    })
  })

  describe('chaves isoladas', () => {
    it('limites de um usuário não afetam outro', () => {
      // Esgota user:aaa
      for (let i = 0; i <= MAX + 1; i++) {
        checkRateLimitWith(store, 'user:aaa', MAX, WINDOW, NOW + i)
      }
      // user:bbb ainda tem quota cheia
      const result = checkRateLimitWith(store, 'user:bbb', MAX, WINDOW, NOW)
      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(MAX - 1)
    })
  })
})

describe('compactLocalStore', () => {
  let store: Store

  beforeEach(() => {
    store = new Map()
  })

  const NOW = 1_700_100_000_000

  it('remove entradas expiradas', () => {
    store.set('old1', { count: 3, resetAt: NOW - 1_000 }) // expirado
    store.set('old2', { count: 5, resetAt: NOW - 500 })  // expirado
    const removed = compactLocalStore(store, NOW)
    expect(removed).toBe(2)
    expect(store.size).toBe(0)
  })

  it('mantém entradas ainda válidas', () => {
    store.set('current', { count: 1, resetAt: NOW + 30_000 }) // válida
    store.set('old', { count: 9, resetAt: NOW - 1 }) // expirada
    const removed = compactLocalStore(store, NOW)
    expect(removed).toBe(1)
    expect(store.has('current')).toBe(true)
    expect(store.has('old')).toBe(false)
  })

  it('retorna 0 quando store está vazia', () => {
    const removed = compactLocalStore(store, NOW)
    expect(removed).toBe(0)
  })

  it('retorna 0 quando todas as entradas são válidas', () => {
    store.set('a', { count: 1, resetAt: NOW + 1_000 })
    store.set('b', { count: 2, resetAt: NOW + 2_000 })
    const removed = compactLocalStore(store, NOW)
    expect(removed).toBe(0)
    expect(store.size).toBe(2)
  })
})
