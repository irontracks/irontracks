import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock logger to prevent import errors
vi.mock('@/lib/logger', () => ({
  logError: vi.fn(),
  logWarn: vi.fn(),
  logInfo: vi.fn(),
}))

// Ensure no Upstash config — tests exercise the local in-memory layer only
beforeEach(() => {
  delete process.env.UPSTASH_REDIS_REST_URL
  delete process.env.UPSTASH_REDIS_REST_TOKEN
})

import {
  cacheGet,
  cacheSet,
  cacheDelete,
  cacheDeletePattern,
  getUpstashConfig,
} from '@/utils/cache'

// ────────────────────────────────────────────────────────────────────────────
// getUpstashConfig
// ────────────────────────────────────────────────────────────────────────────
describe('getUpstashConfig', () => {
  it('returns null when env vars are not set', () => {
    expect(getUpstashConfig()).toBeNull()
  })

  it('returns null when env vars are empty strings', () => {
    process.env.UPSTASH_REDIS_REST_URL = ''
    process.env.UPSTASH_REDIS_REST_TOKEN = ''
    expect(getUpstashConfig()).toBeNull()
  })

  it('returns config when both env vars are set', () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example.com'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'token123'
    const cfg = getUpstashConfig()
    expect(cfg).toEqual({ url: 'https://redis.example.com', token: 'token123' })
    // cleanup
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
  })
})

// ────────────────────────────────────────────────────────────────────────────
// Local-only cache (no Upstash configured)
// ────────────────────────────────────────────────────────────────────────────
describe('cache (local-only, no Upstash)', () => {
  const identity = <T,>(v: unknown) => v as T

  it('cacheSet + cacheGet roundtrip', async () => {
    await cacheSet('test:a', { value: 42 }, 60)
    const result = await cacheGet<{ value: number }>('test:a', identity)
    expect(result).toEqual({ value: 42 })
  })

  it('cacheGet returns null for unknown key', async () => {
    const result = await cacheGet('test:unknown', identity)
    expect(result).toBeNull()
  })

  it('cacheDelete removes a key', async () => {
    await cacheSet('test:del', 'hello', 60)
    await cacheDelete('test:del')
    const result = await cacheGet('test:del', identity)
    expect(result).toBeNull()
  })

  it('cacheSet overwrites existing key', async () => {
    await cacheSet('test:overwrite', 'first', 60)
    await cacheSet('test:overwrite', 'second', 60)
    const result = await cacheGet<string>('test:overwrite', identity)
    expect(result).toBe('second')
  })

  it('expired entries return null', async () => {
    vi.useFakeTimers()
    try {
      await cacheSet('test:expire', 'data', 1) // min TTL = 1s → expiresAt = now + 1000ms
      // Advance past the 1-second TTL
      vi.advanceTimersByTime(1100)
      const result = await cacheGet('test:expire', identity)
      expect(result).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('parser can transform cached value', async () => {
    await cacheSet('test:parse', { name: 'Iron', level: 5 }, 60)
    const parser = (v: unknown) => {
      const obj = v as Record<string, unknown>
      return typeof obj.name === 'string' ? obj.name : null
    }
    const result = await cacheGet<string>('test:parse', parser)
    expect(result).toBe('Iron')
  })

  it('parser returning null means cache miss', async () => {
    await cacheSet('test:parse-null', 'raw', 60)
    const parser = () => null
    const result = await cacheGet('test:parse-null', parser)
    expect(result).toBeNull()
  })
})

// ────────────────────────────────────────────────────────────────────────────
// cacheDeletePattern
// ────────────────────────────────────────────────────────────────────────────
describe('cacheDeletePattern', () => {
  const identity = <T,>(v: unknown) => v as T

  it('deletes keys matching a prefix wildcard', async () => {
    await cacheSet('pattern:a', 1, 60)
    await cacheSet('pattern:b', 2, 60)
    await cacheSet('other:c', 3, 60)

    await cacheDeletePattern('pattern:*')

    expect(await cacheGet('pattern:a', identity)).toBeNull()
    expect(await cacheGet('pattern:b', identity)).toBeNull()
    expect(await cacheGet('other:c', identity)).toEqual(3)
  })

  it('deletes exact key when no wildcard', async () => {
    await cacheSet('exact:key', 'val', 60)
    await cacheSet('exact:key2', 'val2', 60)

    await cacheDeletePattern('exact:key')

    expect(await cacheGet('exact:key', identity)).toBeNull()
    expect(await cacheGet('exact:key2', identity)).toEqual('val2')
  })
})
