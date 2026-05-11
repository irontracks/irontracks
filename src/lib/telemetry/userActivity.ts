import { getRawVersion } from '@/lib/version'
import { parseJsonWithSchema } from '@/utils/zod'
import { z } from 'zod'
import { logError } from '@/lib/logger'

export type UserActivityEvent = {
  name: string
  type?: string
  screen?: string
  path?: string
  metadata?: Record<string, unknown>
}

type QueuedEvent = {
  name: string
  type?: string
  screen?: string
  path?: string
  metadata?: Record<string, unknown>
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

const queuedEventSchema = z.object({
  name: z.string(),
  type: z.string().optional(),
  screen: z.string().optional(),
  path: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  clientTs: z.string().optional(),
  appVersion: z.string().optional(),
})

const safeObj = (v: unknown) => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
  return v as Record<string, unknown>
}

const readStored = () => {
  try {
    if (typeof window === 'undefined') return []
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = parseJsonWithSchema(raw, z.array(queuedEventSchema))
    return Array.isArray(parsed) ? (parsed as QueuedEvent[]) : []
  } catch { /* best effort: localStorage read */ 
    return []
  }
}

const writeStored = (items: unknown[]) => {
  try {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(-MAX_QUEUE)))
  } catch (e) { logError('userActivity.writeStored', e) }
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
      } catch { /* best effort: pathname read */
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
        } catch { /* best effort: version read */
          return undefined
        }
      })(),
    }

    queue.push(payload)
    if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE)
    writeStored(queue)
    scheduleFlush()
  } catch (e) { logError('trackUserEvent', e) }
}

export function trackScreen(screen: string, extra?: Record<string, unknown>) {
  trackUserEvent('open_screen', { type: 'nav', screen: String(screen || '').trim(), metadata: safeObj(extra) })
}

export async function flushUserEvents() {
  await flush({ preferBeacon: true })
}

async function flush({ preferBeacon }: { preferBeacon: boolean }) {
  try {
    if (typeof window === 'undefined') return
    try {
      if (navigator && 'onLine' in navigator && navigator.onLine === false) return
    } catch { /* best effort: navigator.onLine check */ }
    if (flushing) return
    flushing = true

    mergeQueueFromStorage()
    const batch = queue.slice(0, 50)
    if (!batch.length) return

    const body = JSON.stringify({ events: batch })

    // Sempre prefere sendBeacon — é fire-and-forget e o navegador não
    // cancela a request quando a página navega. preferBeacon só vira
    // hint pra quando sendBeacon não está disponível: aí o fetch é o
    // fallback. Antes só usava beacon em hidden/pagehide, e a request
    // do flushTimer caía no fetch durante navegação inicial → ERR_ABORTED
    // poluía o console no boot.
    const sent = (() => {
      try {
        if (!navigator?.sendBeacon) return false
        const blob = new Blob([body], { type: 'application/json' })
        return navigator.sendBeacon(ENDPOINT, blob)
      } catch { /* best effort: sendBeacon fallback */
        return false
      }
    })()

    if (sent) {
      queue = queue.slice(batch.length)
      writeStored(queue)
      return
    }

    // Beacon indisponível ou recusou (payload > 64KB). Usa fetch.
    // Em hidden/pagehide preferBeacon=true: ainda chega aqui se beacon
    // falhar, mas keepalive garante entrega; em flush normal o fetch
    // é o caminho esperado quando beacon falha.
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        keepalive: true,
      })
      if (res.ok) {
        queue = queue.slice(batch.length)
        writeStored(queue)
      }
    } catch (e: unknown) {
      // ERR_ABORTED é esperado durante navegação rápida (página descarregou
      // antes da request completar). Não polui Sentry/logs com isso.
      const name = (e as { name?: string } | null)?.name || ''
      if (name !== 'AbortError') {
        throw e
      }
    }
    void preferBeacon // mantido na API por compatibilidade com flushUserEvents
  } catch (e) { logError('userActivity.flush', e) } finally {
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
  } catch { /* best effort: addEventListener */ }
}
