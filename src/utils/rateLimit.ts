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
 * Example with depth=1 and XFF = "attacker, realClient, vercelEdge":
 *   → we take index -(1) from the right = "vercelEdge" wait, depth of 1 means
 *     the rightmost proxy is trusted, so we take the IP *before* it = "realClient".
 */
const TRUSTED_PROXY_DEPTH = Math.max(1, Number(process.env.TRUSTED_PROXY_DEPTH ?? 1))

/** Basic IPv4 / IPv6 format guard (not full validation, just sanity check). */
const IP_RE = /^([\d.]{7,15}|([\da-f]{0,4}:){2,7}[\da-f]{0,4})$/i

export const getRequestIp = (req: Request): string => {
  try {
    const xff = String(req.headers.get('x-forwarded-for') || '').trim()
    if (xff) {
      const parts = xff.split(',').map((s) => s.trim()).filter(Boolean)
      // Take the IP that is TRUSTED_PROXY_DEPTH positions from the right end.
      // e.g. depth=1 → skip the rightmost (the edge proxy itself) → take parts[parts.length - 1 - 1]
      // If depth >= parts.length we fall back to the leftmost IP (best effort).
      const idx = Math.max(0, parts.length - 1 - (TRUSTED_PROXY_DEPTH - 1))
      const candidate = parts[idx] ?? ''
      if (IP_RE.test(candidate)) return candidate
    }
  } catch {}
  try {
    const real = String(req.headers.get('x-real-ip') || '').trim()
    if (real && IP_RE.test(real)) return real
  } catch {}
  // Unknown IP → still rate-limited (all unknowns share a bucket)
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
    if (process.env.NODE_ENV === 'production') {
      // Use console.warn directly — logger may not be available at module level
      console.warn(msg)
    } else {
      console.warn(msg)
    }
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

// ── Upstash Redis (distributed) rate limiter ──────────────────────────────────

const getUpstashConfig = () => {
  try {
    const url = String(process.env.UPSTASH_REDIS_REST_URL || '').trim()
    const token = String(process.env.UPSTASH_REDIS_REST_TOKEN || '').trim()
    if (!url || !token) return null
    return { url, token }
  } catch {
    return null
  }
}

const normalizeRateLimit = (countRaw: unknown, ttlRaw: unknown, max: number, windowMs: number): RateLimitResult => {
  const now = Date.now()
  const count = Number(countRaw) || 0
  const ttl = Number(ttlRaw)
  const ttlMs = Number.isFinite(ttl) && ttl > 0 ? ttl : windowMs
  const resetAt = now + ttlMs
  const remaining = Math.max(0, max - count)
  return {
    allowed: count <= max,
    remaining,
    resetAt,
    retryAfterSeconds: Math.ceil(ttlMs / 1000),
  }
}

export const checkRateLimitAsync = async (key: string, max: number, windowMs: number): Promise<RateLimitResult> => {
  const cfg = getUpstashConfig()
  if (!cfg) return checkRateLimit(key, max, windowMs)

  // Upstash is available → switch backend indicator (idempotent assignment)
  RATE_LIMIT_BACKEND = 'redis'

  try {
    const body = {
      script: `local v=redis.call('INCR',KEYS[1]); if v==1 then redis.call('PEXPIRE',KEYS[1],ARGV[1]); end; local ttl=redis.call('PTTL',KEYS[1]); return {v, ttl};`,
      keys: [key],
      args: [String(windowMs)],
    }
    const res = await fetch(`${cfg.url}/eval`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    const json = await res.json().catch((): null => null)
    const result = json && typeof json === 'object' ? (json as Record<string, unknown>).result : null
    if (Array.isArray(result) && result.length >= 2) {
      return normalizeRateLimit(result[0], result[1], max, windowMs)
    }
    if (Array.isArray(json) && json.length >= 2) {
      return normalizeRateLimit(json[0], json[1], max, windowMs)
    }
    return checkRateLimit(key, max, windowMs)
  } catch {
    return checkRateLimit(key, max, windowMs)
  }
}
