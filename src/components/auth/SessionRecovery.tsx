'use client'

import { useEffect, useMemo, useRef } from 'react'
import { createClient } from '@/utils/supabase/client'
import { trackUserEvent } from '@/lib/telemetry/userActivity'

const LAST_REFRESH_KEY = 'irontracks.auth.lastRefresh'
const MIN_REFRESH_GAP_MS = 5 * 60 * 1000
const INTERVAL_MS = 15 * 60 * 1000

const now = () => Date.now()

const readLastRefresh = () => {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(LAST_REFRESH_KEY) : ''
    const n = Number(raw || 0)
    return Number.isFinite(n) ? n : 0
  } catch {
    return 0
  }
}

const writeLastRefresh = (ts: number) => {
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem(LAST_REFRESH_KEY, String(ts))
  } catch {}
}

const isOnline = () => {
  try {
    if (typeof navigator === 'undefined') return true
    if (!('onLine' in navigator)) return true
    return navigator.onLine !== false
  } catch {
    return true
  }
}

const shouldRefresh = () => now() - readLastRefresh() >= MIN_REFRESH_GAP_MS

export default function SessionRecovery() {
  const supabase = useMemo(() => createClient(), [])
  const refreshingRef = useRef(false)

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null
    let mounted = true

    const registerSync = async () => {
      try {
        if (!('serviceWorker' in navigator)) return
        const reg = await navigator.serviceWorker.ready
        const sync = (reg as ServiceWorkerRegistration & { sync?: { register: (tag: string) => Promise<void> } }).sync
        if (sync && typeof sync.register === 'function') {
          await sync.register('it-auth-refresh')
        }
      } catch {}
    }

    const refresh = async (reason: string) => {
      if (!mounted || refreshingRef.current) return
      if (!isOnline() || !shouldRefresh()) return
      refreshingRef.current = true
      try {
        const { data } = await supabase.auth.getSession()
        if (!data?.session) {
          await supabase.auth.refreshSession()
        } else {
          await supabase.auth.refreshSession()
        }
        writeLastRefresh(now())
        trackUserEvent('auth_refresh', { type: 'auth', metadata: { reason } })
      } catch (e) {
        trackUserEvent('auth_refresh_fail', { type: 'auth', metadata: { reason, error: String((e as Record<string, unknown>)?.message ?? e) } })
      } finally {
        refreshingRef.current = false
      }
    }

    refresh('startup').catch(() => null)
    registerSync().catch(() => null)

    interval = setInterval(() => {
      refresh('interval').catch(() => null)
    }, INTERVAL_MS)

    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      refresh('visibility').catch(() => null)
    }
    const onOnline = () => {
      refresh('online').catch(() => null)
    }

    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onOnline)

    return () => {
      mounted = false
      if (interval) clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onOnline)
    }
  }, [supabase])

  return null
}
