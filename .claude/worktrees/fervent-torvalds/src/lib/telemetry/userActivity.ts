import { getRawVersion } from '@/lib/version'

export type UserActivityEvent = {
  name: string
  type?: string
  screen?: string
  path?: string
  metadata?: Record<string, any>
}

type QueuedEvent = {
  name: string
  type?: string
  screen?: string
  path?: string
  metadata?: Record<string, any>
  clientTs?: string
  appVersion?: string
}

const ENDPOINT = '/api/telemetry/user-event'
const MAX_QUEUE = 200
const STORAGE_KEY = 'irontracks.userActivity.queue.v1'

let queue: QueuedEvent[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null
let flushing = false
let lastByKey = new Map<string, number>()

const now = () => Date.now()

const safeObj = (v: unknown) => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
  return v as Record<string, any>
}

const readStored = () => {
  try {
    if (typeof window === 'undefined') return []
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const writeStored = (items: unknown[]) => {
  try {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(-MAX_QUEUE)))
  } catch {}
}

const mergeQueueFromStorage = () => {
  if (queue.length) return
  const stored = readStored()
  if (stored.length) queue = stored.slice(-MAX_QUEUE)
}

const scheduleFlush = () => {
  if (typeof window === 'undefined') return
  if (flushTimer) return
  flushTimer = window.setTimeout(() => {
    flushTimer = null
    flush({ preferBeacon: false })
  }, 2000) as unknown as ReturnType<typeof setTimeout>
}

const shouldDrop = (key: string, ms: number) => {
  const t = lastByKey.get(key) || 0
  const n = now()
  if (n - t < ms) return true
  lastByKey.set(key, n)
  return false
}

export function trackUserEvent(eventName: string, data?: Omit<UserActivityEvent, 'name'>) {
  try {
    if (typeof window === 'undefined') return
    const name = String(eventName || '').trim()
    if (!name) return

    const path = (() => {
      if (data?.path) return String(data.path)
      try {
        return window.location?.pathname ? String(window.location.pathname) : ''
      } catch {
        return ''
      }
    })()

    const key = `${name}::${path}`
    if (shouldDrop(key, 1200)) return

    mergeQueueFromStorage()

    const payload: QueuedEvent = {
      name,
      type: data?.type ? String(data.type) : undefined,
      screen: data?.screen ? String(data.screen) : undefined,
      path: path || undefined,
      metadata: safeObj(data?.metadata),
      clientTs: new Date().toISOString(),
      appVersion: (() => {
        try {
          return String(getRawVersion() || '')
        } catch {
          return undefined
        }
      })(),
    }

    queue.push(payload)
    if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE)
    writeStored(queue)
    scheduleFlush()
  } catch {}
}

export function trackScreen(screen: string, extra?: Record<string, any>) {
  trackUserEvent('open_screen', { type: 'nav', screen: String(screen || '').trim(), metadata: safeObj(extra) })
}

export async function flushUserEvents() {
  await flush({ preferBeacon: true })
}

async function flush({ preferBeacon }: { preferBeacon: boolean }) {
  try {
    if (typeof window === 'undefined') return
    if (flushing) return
    flushing = true

    mergeQueueFromStorage()
    const batch = queue.slice(0, 50)
    if (!batch.length) return

    const body = JSON.stringify({ events: batch })

    const sent = (() => {
      if (!preferBeacon) return false
      try {
        if (!navigator?.sendBeacon) return false
        const blob = new Blob([body], { type: 'application/json' })
        return navigator.sendBeacon(ENDPOINT, blob)
      } catch {
        return false
      }
    })()

    if (sent) {
      queue = queue.slice(batch.length)
      writeStored(queue)
      return
    }

    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      keepalive: true,
    })

    const ok = res.ok
    if (ok) {
      queue = queue.slice(batch.length)
      writeStored(queue)
    }
  } catch {} finally {
    flushing = false
  }
}

if (typeof window !== 'undefined') {
  try {
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'hidden') return
      flush({ preferBeacon: true })
    })
    window.addEventListener('pagehide', () => {
      flush({ preferBeacon: true })
    })
  } catch {}
}

