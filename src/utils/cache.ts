type CacheEntry = {
  value: string
  expiresAt: number
}

const localStore = new Map<string, CacheEntry>()

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

const writeLocal = (key: string, value: string, ttlSeconds: number) => {
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
  writeLocal(key, payload, ttlSeconds)

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
  } catch {}
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
  } catch {}
}
