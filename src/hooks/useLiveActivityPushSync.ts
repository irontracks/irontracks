/**
 * useLiveActivityPushSync
 *
 * Captures Live Activity push tokens (rest timer, workout) and forwards them
 * to the backend via POST /api/devices/live-activity-token. The backend uses
 * these tokens to update the Dynamic Island / Lock Screen via APNs even when
 * the app is backgrounded or killed (Feature 11).
 *
 * Apple rotates these tokens periodically — we re-emit on every change.
 * No-op on non-iOS.
 */
'use client'

import { useEffect } from 'react'
import {
  addLiveActivityPushTokenListener,
  getLiveActivityPushTokens,
  type LiveActivityPushToken,
} from '@/utils/native/irontracksNative'
import { isIosNative } from '@/utils/platform'
import { logWarn } from '@/lib/logger'

const ENDPOINT = '/api/devices/live-activity-token'

const postToken = async (token: LiveActivityPushToken): Promise<void> => {
  try {
    await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: token.kind,
        activityId: token.activityId ?? '',
        token: token.token,
        platform: 'ios',
      }),
    })
  } catch (e) {
    logWarn('useLiveActivityPushSync', 'Failed to upload LA token', e)
  }
}

export function useLiveActivityPushSync(): void {
  useEffect(() => {
    if (!isIosNative()) return

    // Snapshot on mount — covers tokens that were issued while the listener
    // wasn't attached (cold start with an active LA from a previous session).
    void (async () => {
      const tokens = await getLiveActivityPushTokens()
      for (const t of tokens) {
        if (t.token) void postToken(t)
      }
    })()

    const unsubscribe = addLiveActivityPushTokenListener((token) => {
      if (token.token) void postToken(token)
    })

    return () => { try { unsubscribe() } catch { /* swallow */ } }
  }, [])
}
