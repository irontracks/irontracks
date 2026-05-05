/**
 * useBackgroundRefresh
 *
 * Wires the iOS BGTaskScheduler hooks (Feature 15) into the JS layer:
 *
 *   • On app pause (visibilitychange → hidden) → schedule the next slot so iOS
 *     knows we want background time. Without this iOS never fires the tasks.
 *   • On `backgroundRefresh` event → flush the offline queue + warn the
 *     server about widget data so widgets stay fresh.
 *
 * No-op on non-iOS-native. Mounted once per session at the dashboard root.
 */
'use client'

import { useEffect } from 'react'
import {
  addBackgroundRefreshListener,
  scheduleBackgroundTasks,
} from '@/utils/native/irontracksNative'
import { isIosNative } from '@/utils/platform'
import { flushOfflineQueue } from '@/lib/offline/offlineSync'
import { logWarn } from '@/lib/logger'

export function useBackgroundRefresh(): void {
  useEffect(() => {
    if (!isIosNative()) return

    // Schedule the very first slot now (subsequent ones cascade in AppDelegate
    // after each handleAppRefresh / handleSync call).
    void scheduleBackgroundTasks()

    const onPause = () => {
      if (document.visibilityState === 'hidden') {
        void scheduleBackgroundTasks()
      }
    }
    document.addEventListener('visibilitychange', onPause)

    const unsubscribe = addBackgroundRefreshListener(async (kind) => {
      try {
        // Both refresh and sync run the same offline-queue flush. Sync gets up
        // to ~3 min so we use force=true to also clear failed jobs that may
        // have been retried since a transient network blip.
        await flushOfflineQueue({ force: kind === 'sync' })
      } catch (e) {
        logWarn('useBackgroundRefresh', 'BG flush failed', e)
      }
    })

    return () => {
      document.removeEventListener('visibilitychange', onPause)
      try { unsubscribe() } catch { /* swallow */ }
    }
  }, [])
}
