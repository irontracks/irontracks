export type RateLimitResult = {
  allowed: boolean
  remaining: number
  resetAt: number
  retryAfterSeconds: number
}

type Entry = { count: number; resetAt: number }

const getStore = (): Map<string, Entry> => {
  const g = globalThis as unknown as { __irontracksRateLimitStore?: Map<string, Entry> }
  if (!g.__irontracksRateLimitStore) g.__irontracksRateLimitStore = new Map()
  return g.__irontracksRateLimitStore as Map<string, Entry>
}

export const getRequestIp = (req: Request) => {
  try {
    const xff = String(req.headers.get('x-forwarded-for') || '').trim()
    if (xff) return xff.split(',')[0].trim()
  } catch {}
  try {
    const real = String(req.headers.get('x-real-ip') || '').trim()
    if (real) return real
  } catch {}
  return ''
}

export const checkRateLimit = (key: string, max: number, windowMs: number): RateLimitResult => {
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
