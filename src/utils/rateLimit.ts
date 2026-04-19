import { logError, logWarn } from '@/lib/logger'
import { env } from '@/utils/env'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

export type RateLimitResult = {
  allowed: boolean
  remaining: number
  resetAt: number
  retryAfterSeconds: number
}

type Entry = { count: number; resetAt: number }

/**
 * Which backend is currently serving rate limit checks.
 * - `'redis'`  → Upstash configured; limits are distributed across instances.
 * - `'memory'` → No Upstash; limits are per-instance only. In multi-instance
 *               deployments (Vercel, containers) an attacker can bypass limits
 *               by hitting different instances. Configure UPSTASH_REDIS_REST_URL
 *               and UPSTASH_REDIS_REST_TOKEN to enable distributed mode.
 */
export let RATE_LIMIT_BACKEND: 'memory' | 'redis' = 'memory'

const getStore = (): Map<string, Entry> => {
  const g = globalThis as unknown as { __irontracksRateLimitStore?: Map<string, Entry> }
  if (!g.__irontracksRateLimitStore) g.__irontracksRateLimitStore = new Map()
  return g.__irontracksRateLimitStore as Map<string, Entry>
}

// ── IP extraction ─────────────────────────────────────────────────────────────

/**
 * How many trusted reverse-proxy hops sit in front of the app.
 * Configured via env `TRUSTED_PROXY_DEPTH` (default: 1, suitable for Vercel/CF).
 *
 * The `X-Forwarded-For` header is read **right-to-left** by this depth so that
 * a client cannot spoof its IP by injecting extra values at the left of the list.
 *
 * Example with depth=1 and XFF = "realClient, vercelEdge":
 *   → skip 1 rightmost trusted proxy → parts[parts.length - 1 - 1] = parts[0] = realClient
 */
const TRUSTED_PROXY_DEPTH = env.security.trustedProxyDepth

/** Basic IPv4 / IPv6 format guard (not full validation, just sanity check). */
const IP_RE = /^([\d.]{7,15}|([\da-f]{0,4}:){2,7}[\da-f]{0,4})$/i

export const getRequestIp = (req: Request): string => {
  try {
    const xff = String(req.headers.get('x-forwarded-for') || '').trim()
    if (xff) {
      const parts = xff.split(',').map((s) => s.trim()).filter(Boolean)
      const idx = Math.max(0, parts.length - 1 - TRUSTED_PROXY_DEPTH)
      const candidate = parts[idx] ?? ''
      if (IP_RE.test(candidate)) return candidate
    }
  } catch {}
  try {
    const real = String(req.headers.get('x-real-ip') || '').trim()
    if (real && IP_RE.test(real)) return real
  } catch {}
  return 'unknown'
}

// ── In-memory (per-instance) rate limiter ─────────────────────────────────────

/** @internal — one-shot warning flag so we don't spam logs */
let _warnedMemoryMode = false

export const checkRateLimit = (key: string, max: number, windowMs: number): RateLimitResult => {
  if (!_warnedMemoryMode && RATE_LIMIT_BACKEND === 'memory') {
    _warnedMemoryMode = true
    const msg =
      '[rateLimit] Running in in-memory mode (no Upstash). ' +
      'Rate limits are per-instance and will not protect against distributed abuse. ' +
      'Set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN to enable distributed rate limiting.'
    logWarn('rateLimit', msg)
  }

  const now = Date.now()
  const store = getStore()
  const prev = store.get(key)

  if (!prev || prev.resetAt <= now) {
    const resetAt = now + Math.max(1, windowMs)
    store.set(key, { count: 1, resetAt })
    return { allowed: true, remaining: Math.max(0, max - 1), resetAt, retryAfterSeconds: Math.ceil((resetAt - now) / 1000) }
  }

  const nextCount = prev.count + 1
  const allowed = nextCount <= max
  store.set(key, { count: nextCount, resetAt: prev.resetAt })
  return {
    allowed,
    remaining: Math.max(0, max - nextCount),
    resetAt: prev.resetAt,
    retryAfterSeconds: Math.ceil((prev.resetAt - now) / 1000),
  }
}

// ── Upstash Ratelimit (distributed) ──────────────────────────────────────────
//
// Migrated from a hand-rolled EVAL fetch to the official @upstash/ratelimit
// library (Finding #54). The custom implementation worked in sequential
// testing but produced {400: 60, 429: 0} in parallel burst against Vercel
// fluid-compute (vs {400: 20, 429: 40} in local `npm run dev` — see #54
// last comment). The library handles cold-start warmup, multi-region
// replication, and concurrent requests in a battle-tested way.
//
// The public API (checkRateLimitAsync, getRequestIp, RateLimitResult) is
// preserved so no caller needs to change.

const getUpstashConfig = () => {
  try {
    const url = env.upstash.restUrl.trim()
    const token = env.upstash.restToken.trim()
    if (!url || !token) return null
    return { url, token }
  } catch {
    return null
  }
}

type RateLimitGlobals = {
  __irontracksRateLimitRedis?: Redis
  __irontracksRateLimitInstances?: Map<string, Ratelimit>
}

const getRedis = (): Redis | null => {
  const cfg = getUpstashConfig()
  if (!cfg) return null
  const g = globalThis as unknown as RateLimitGlobals
  if (!g.__irontracksRateLimitRedis) {
    g.__irontracksRateLimitRedis = new Redis({ url: cfg.url, token: cfg.token })
  }
  return g.__irontracksRateLimitRedis
}

const getRatelimitFor = (max: number, windowMs: number): Ratelimit | null => {
  const redis = getRedis()
  if (!redis) return null
  const g = globalThis as unknown as RateLimitGlobals
  if (!g.__irontracksRateLimitInstances) {
    g.__irontracksRateLimitInstances = new Map()
  }
  const cacheKey = `${max}:${windowMs}`
  const cached = g.__irontracksRateLimitInstances.get(cacheKey)
  if (cached) return cached
  const rl = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(max, `${windowMs} ms`),
    analytics: false,
    prefix: 'rl',
  })
  g.__irontracksRateLimitInstances.set(cacheKey, rl)
  return rl
}

export const checkRateLimitAsync = async (key: string, max: number, windowMs: number): Promise<RateLimitResult> => {
  const rl = getRatelimitFor(max, windowMs)
  if (!rl) return checkRateLimit(key, max, windowMs)

  RATE_LIMIT_BACKEND = 'redis'

  try {
    const result = await rl.limit(key)
    const now = Date.now()
    const resetAt = typeof result.reset === 'number' && result.reset > 0 ? result.reset : now + windowMs
    return {
      allowed: result.success,
      remaining: Math.max(0, result.remaining),
      resetAt,
      retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1000)),
    }
  } catch (e) {
    logError('checkRateLimitAsync.ratelimit', e)
    return checkRateLimit(key, max, windowMs)
  }
}
