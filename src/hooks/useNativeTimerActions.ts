/**
 * @module useNativeTimerActions
 *
 * Handles interactive notification actions from the iOS native timer.
 * When the user taps "Next Set" or "Skip Rest" on a push notification,
 * the native shell forwards the action here so the web session can
 * advance to the next set automatically.
 *
 * @param session - Active workout session to mutate on action receipt
 */
'use client'

import { useEffect } from 'react'
import { onNativeNotificationAction } from '@/utils/native/irontracksNative'
import type { ActiveWorkoutSession } from '@/types/app'

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

interface UseNativeTimerActionsOptions {
  handleCloseTimer: () => void
  setActiveSession: React.Dispatch<React.SetStateAction<ActiveWorkoutSession | null>>
}

/**
 * Binds native timer controls coming from two sources:
 *  1. iOS Live Notification actions (@capacitor/push-notifications)
 *     – handled via `onNativeNotificationAction`
 *  2. iOS Live Activity deeplinks (irontracks://action/*)
 *     – handled via the custom DOM event `irontracks:action`
 *
 * Supported actions: SKIP_REST, START_REST, ADD_30S
 *
 * Extracted from IronTracksAppClientImpl to keep the root component lean.
 */
export function useNativeTimerActions({
  handleCloseTimer,
  setActiveSession,
}: UseNativeTimerActionsOptions) {
  // ── 1. Notification action (Capacitor push plugin) ────────────────────
  useEffect(() => {
    const off = onNativeNotificationAction((actionId) => {
      if (!actionId) return

      if (actionId === 'SKIP_REST' || actionId === 'START_REST') {
        handleCloseTimer()
        return
      }

      if (actionId === 'ADD_30S') {
        setActiveSession((prev) => {
          if (!prev) return prev
          const base = prev as Record<string, unknown>
          const ctx = isRecord(base.timerContext)
            ? (base.timerContext as Record<string, unknown>)
            : null
          const kind = String(ctx?.kind || '').trim()
          const t = Number(base.timerTargetTime)
          if (kind !== 'rest' || !Number.isFinite(t) || t <= 0) return prev
          return { ...base, timerTargetTime: t + 30_000 } as ActiveWorkoutSession
        })
      }
    })

    return () => {
      try {
        off()
      } catch {}
    }
  }, [handleCloseTimer, setActiveSession])

  // ── 2. Live Activity deeplink (irontracks://action/*) ─────────────────
  useEffect(() => {
    const onLiveActivityAction = (e: Event) => {
      try {
        const action = String((e as CustomEvent)?.detail?.action || '').trim()
        if (!action) return
        if (action === 'START_REST' || action === 'SKIP_REST') {
          handleCloseTimer()
        }
      } catch {}
    }

    window.addEventListener('irontracks:action', onLiveActivityAction)
    return () => window.removeEventListener('irontracks:action', onLiveActivityAction)
  }, [handleCloseTimer])
}
