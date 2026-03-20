'use client'

import { useEffect, useCallback } from 'react'
import { unlockAudio } from '@/lib/sounds'
import type { ActiveWorkoutSession } from '@/types/app'

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

interface UseAppEffectsOptions {
  view: string
  activeSession: ActiveWorkoutSession | null
  mainScrollRef: React.RefObject<HTMLDivElement | null>
  restoreAdminPanelIfNeeded: () => void
  handleCloseTimer: () => void
  handleUpdateSessionLog: (key: string, log: Record<string, unknown>) => void
  setActiveSession: React.Dispatch<React.SetStateAction<ActiveWorkoutSession | null>>
}

/**
 * Bundles misc effects & handlers from IronTracksAppClientImpl:
 * - Audio unlock on first interaction
 * - Admin panel restore on visibility
 * - Scroll-to-top on active view
 * - handleStartFromRestTimer transition callback
 */
export function useAppEffects({
  view,
  activeSession,
  mainScrollRef,
  restoreAdminPanelIfNeeded,
  handleCloseTimer,
  handleUpdateSessionLog,
  setActiveSession,
}: UseAppEffectsOptions) {
  // Audio unlock on first user interaction
  useEffect(() => {
    const handler = () => { try { unlockAudio(); } catch { } }
    document.addEventListener('touchstart', handler, { once: true })
    document.addEventListener('click', handler, { once: true })
    return () => {
      document.removeEventListener('touchstart', handler)
      document.removeEventListener('click', handler)
    }
  }, [])

  // Admin panel restore on visibility change
  useEffect(() => {
    restoreAdminPanelIfNeeded()
    const onVisibility = () => {
      if (typeof document === 'undefined') return
      if (document.visibilityState === 'visible') restoreAdminPanelIfNeeded()
    }
    const onPageShow = () => restoreAdminPanelIfNeeded()
    try {
      document.addEventListener('visibilitychange', onVisibility)
      window.addEventListener('pageshow', onPageShow)
    } catch { }
    return () => {
      try {
        document.removeEventListener('visibilitychange', onVisibility)
        window.removeEventListener('pageshow', onPageShow)
      } catch { }
    }
  }, [restoreAdminPanelIfNeeded])

  // Scroll to top when entering active workout view
  useEffect(() => {
    if (view !== 'active') return
    const scrollToTop = () => {
      const node = mainScrollRef.current
      if (node) node.scrollTo({ top: 0, left: 0, behavior: 'auto' })
      if (typeof window !== 'undefined') window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    }
    const raf = requestAnimationFrame(scrollToTop)
    const t = window.setTimeout(scrollToTop, 120)
    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(t)
    }
  }, [view, activeSession?.id, mainScrollRef])

  // Handler: transition from rest timer back to active set
  const handleStartFromRestTimer = useCallback(
    (ctx?: unknown) => {
      const nowMs = Date.now()
      const ctxObj = isRecord(ctx) ? (ctx as Record<string, unknown>) : null
      const prevKey = ctxObj ? String(ctxObj.key ?? '').trim() : ''
      const nextKey = ctxObj ? String(ctxObj.nextKey ?? '').trim() : ''
      const restStartedRaw = ctxObj ? ctxObj.restStartedAtMs : null
      const restStartedAtMs = typeof restStartedRaw === 'number' ? restStartedRaw : Number(String(restStartedRaw ?? '').trim())

      if (prevKey) {
        const logsObj = isRecord(activeSession?.logs) ? (activeSession?.logs as Record<string, unknown>) : {}
        const prevLog = logsObj[prevKey]
        const prevLogObj = isRecord(prevLog) ? (prevLog as Record<string, unknown>) : {}
        const completedRaw = prevLogObj.completedAtMs
        const completedAtMs = typeof completedRaw === 'number' ? completedRaw : Number(String(completedRaw ?? '').trim())
        const base = restStartedAtMs > 0 ? restStartedAtMs : completedAtMs > 0 ? completedAtMs : 0
        const restSeconds = base > 0 ? Math.max(0, Math.round((nowMs - base) / 1000)) : null
        if (restSeconds != null) {
          handleUpdateSessionLog(prevKey, { ...prevLogObj, restSeconds })
        }
      }

      if (nextKey) {
        const logsObj = isRecord(activeSession?.logs) ? (activeSession?.logs as Record<string, unknown>) : {}
        const nextLog = logsObj[nextKey]
        const nextLogObj = isRecord(nextLog) ? (nextLog as Record<string, unknown>) : {}
        if (!Boolean(nextLogObj.done)) {
          handleUpdateSessionLog(nextKey, { ...nextLogObj, startedAtMs: nowMs })
          setActiveSession((prev) => {
            if (!prev) return prev
            const base = prev && typeof prev === 'object' ? (prev as Record<string, unknown>) : {}
            const ui = isRecord(base.ui) ? (base.ui as Record<string, unknown>) : {}
            return { ...(prev as Record<string, unknown>), ui: { ...ui, activeExecution: { key: nextKey, startedAtMs: nowMs } } } as unknown as ActiveWorkoutSession
          })
        }
      }

      handleCloseTimer()
    },
    [activeSession?.logs, handleCloseTimer, handleUpdateSessionLog, setActiveSession]
  )

  return { handleStartFromRestTimer }
}
