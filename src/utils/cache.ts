import { logWarn } from '@/lib/logger'

type CacheEntry = {
  value: string
  expiresAt: number
}

const localStore = new Map<string, CacheEntry>()

export const getUpstashConfig = () => {
  try {
    const url = String(process.env.UPSTASH_REDIS_REST_URL || '').trim()
    const token = String(process.env.UPSTASH_REDIS_REST_TOKEN || '').trim()
    if (!url || !token) return null
    return { url, token }
  } catch {
    return null
  }
}

const parseJson = (raw: string): unknown | null => {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

type CacheParser<T> = (value: unknown) => T | null

const readLocal = (key: string): string | null => {
  const hit = localStore.get(key)
  if (!hit) return null
  if (Date.now() >= hit.expiresAt) {
    localStore.delete(key)
    return null
  }
  return hit.value
}

/**
 * Removes all expired entries from the in-memory store.
 * Called proactively to prevent unbounded memory growth in long-lived
 * (warm) serverless or dev-mode instances.
 */
const compactLocalStore = () => {
  const now = Date.now()
  for (const [k, v] of localStore) {
    if (v.expiresAt <= now) localStore.delete(k)
  }
}

const HIGH_WATER_MARK = 500

const writeLocal = (key: string, value: string, ttlSeconds: number) => {
  if (localStore.size >= HIGH_WATER_MARK) compactLocalStore()
  const ttlMs = Math.max(1, ttlSeconds) * 1000
  localStore.set(key, { value, expiresAt: Date.now() + ttlMs })
}

const deleteLocal = (key: string) => {
  localStore.delete(key)
}

export const cacheGet = async <T>(key: string, parser: CacheParser<T>): Promise<T | null> => {
  const local = readLocal(key)
  if (local != null) {
    const parsed = parseJson(local)
    return parsed == null ? null : parser(parsed)
  }

  const cfg = getUpstashConfig()
  if (!cfg) return null

  try {
    const res = await fetch(`${cfg.url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${cfg.token}` },
    })
    if (!res.ok) return null
    const json = (await res.json().catch(() => null)) as null | Record<string, unknown>
    const result = json && typeof json === 'object' ? json.result : null
    if (result == null) return null
    const raw = String(result)
    writeLocal(key, raw, 30)
    const parsed = parseJson(raw)
    return parsed == null ? null : parser(parsed)
  } catch {
    return null
  }
}

export const cacheSet = async (key: string, value: unknown, ttlSeconds: number): Promise<void> => {
  const payload = JSON.stringify(value)
  // Local (in-memory) cache is capped at 30s so it acts as a short-lived L1.
  // Upstash is the authoritative store for the full TTL. This prevents the local
  // layer from serving stale data if Upstash is invalidated externally.
  writeLocal(key, payload, Math.min(ttlSeconds, 30))

  const cfg = getUpstashConfig()
  if (!cfg) return

  try {
    await fetch(`${cfg.url}/set/${encodeURIComponent(key)}?EX=${Math.max(1, Math.floor(ttlSeconds))}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        'Content-Type': 'text/plain',
      },
      body: payload,
    })
  } catch (e) { logWarn('cache', `cacheSet failed for key=${key}`, e) }
}

export const cacheDelete = async (key: string): Promise<void> => {
  deleteLocal(key)
  const cfg = getUpstashConfig()
  if (!cfg) return
  try {
    await fetch(`${cfg.url}/del/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.token}` },
    })
  } catch (e) { logWarn('cache', `cacheDelete failed for key=${key}`, e) }
}

export const cacheDeletePattern = async (pattern: string): Promise<void> => {
  try {
    const keysToDelete: string[] = []
    const isPrefix = pattern.endsWith('*')
    const prefix = isPrefix ? pattern.slice(0, -1) : pattern

    for (const k of localStore.keys()) {
      if (isPrefix ? k.startsWith(prefix) : k === pattern) {
        keysToDelete.push(k)
      }
    }
    for (const k of keysToDelete) {
      localStore.delete(k)
    }
  } catch (e) { logWarn('cache', 'cacheDeletePattern local cleanup failed', e) }

  const cfg = getUpstashConfig()
  if (!cfg) return

  try {
    const body = {
      script: `
        local cursor = "0"
        local deleted = 0
        repeat
            local result = redis.call("SCAN", cursor, "MATCH", ARGV[1], "COUNT", 100)
            cursor = result[1]
            local keys = result[2]
            if #keys > 0 then
                redis.call("DEL", unpack(keys))
                deleted = deleted + #keys
            end
        until cursor == "0"
        return deleted
      `,
      keys: [],
      args: [pattern],
    }
    await fetch(`${cfg.url}/eval`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
  } catch (e) { logWarn('cache', `cacheDeletePattern failed for pattern=${pattern}`, e) }
}

/**
 * Atomically sets a key only if it does not exist (NX semantics).
 *
 * Returns:
 *  - `true`  → key was newly set (this request "owns" it)
 *  - `false` → key already existed **OR** Upstash is unavailable
 *
 * **Fail-closed design**: when the Redis backend is offline we return `false`
 * (deny / treat as duplicate). This prevents double-processing during Upstash
 * outages at the cost of rejecting the first request in that window.
 * Callers should respond with HTTP 503 + `Retry-After` so the client retries.
 */
export const cacheSetNx = async (key: string, value: string, ttlSeconds: number): Promise<boolean> => {
  const cfg = getUpstashConfig()
  if (!cfg) {
    logWarn('cache', `cacheSetNx: Upstash not configured — returning false (fail-closed) for key=${key}`)
    return false
  }

  try {
    const res = await fetch(
      `${cfg.url}/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}?NX=true&EX=${Math.max(1, Math.floor(ttlSeconds))}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${cfg.token}` },
      }
    )
    if (!res.ok) {
      logWarn('cache', `cacheSetNx: Upstash returned HTTP ${res.status} for key=${key} — returning false (fail-closed)`)
      return false
    }
    const json = await res.json().catch(() => null)
    const result = json && typeof json === 'object' ? (json as Record<string, unknown>).result : null
    return result === 'OK'
  } catch (e) {
    logWarn('cache', `cacheSetNx: network error for key=${key} — returning false (fail-closed)`, e)
    return false
  }
}
