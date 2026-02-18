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
