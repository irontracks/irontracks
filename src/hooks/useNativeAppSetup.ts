'use client'

import { useEffect } from 'react'
import { isIosNative } from '@/utils/platform'
import {
  requestNativeNotifications,
  setupNativeNotificationActions,
} from '@/utils/native/irontracksNative'

/**
 * Runs once per user session on iOS native:
 *  1. Requests notification permission (shows iOS dialog on first run)
 *  2. Registers REST_TIMER notification category with "Pular" / "+30s" actions
 *
 * Safe to call on every mount — debounced by localStorage key per userId.
 */
export function useNativeAppSetup(userId?: string | null) {
  useEffect(() => {
    if (!isIosNative()) return
    const stableId = String(userId || '').trim()
    const storageKey = stableId ? `irontracks.native.setup.v2.${stableId}` : `irontracks.native.setup.v2.global`
    if (typeof window !== 'undefined' && localStorage.getItem(storageKey)) return

    // Register notification categories first (no permission required)
    void setupNativeNotificationActions()

    // Request permission — shows iOS system dialog on first call
    requestNativeNotifications()
      .then((res) => {
        if (typeof window !== 'undefined') {
          localStorage.setItem(storageKey, '1')
        }
      })
      .catch(() => {})
  }, [userId])
}
