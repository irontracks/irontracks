/**
 * useNativeIntentRouter
 *
 * Listens for App Intent actions fired by Siri / Shortcuts on iOS and routes
 * the app accordingly. Two paths:
 *
 *   • Cold start — app was launched by an intent. We poll UserDefaults via
 *     `checkPendingIntentAction()` once on mount.
 *   • Warm start — app was already in memory. The native plugin emits an
 *     `intentAction` event which we subscribe to.
 *
 * For every intent we currently route to the dashboard view (where streak,
 * recent workouts and the start button live). Deep links into specific
 * sub-screens can be layered on later without touching the Swift side.
 */
'use client'

import { useEffect } from 'react'
import {
  checkPendingIntentAction,
  addIntentActionListener,
  type IntentAction,
} from '@/utils/native/irontracksNative'
import { isIosNative } from '@/utils/platform'

interface UseNativeIntentRouterOptions {
  /** Called when any Siri / Shortcut intent fires. Pass the dashboard navigator. */
  onAction: (action: Exclude<IntentAction, ''>) => void
}

export function useNativeIntentRouter({ onAction }: UseNativeIntentRouterOptions): void {
  useEffect(() => {
    if (!isIosNative()) return

    let unsubscribe: (() => void) | undefined

    // 1. Cold start fallback — read & clear any pending action set before mount.
    void checkPendingIntentAction().then((action) => {
      if (action) onAction(action)
    })

    // 2. Warm start subscription — fires while the app is already running.
    unsubscribe = addIntentActionListener((action) => {
      if (action) onAction(action)
    })

    return () => {
      try { unsubscribe?.() } catch { /* swallow */ }
    }
  }, [onAction])
}
