/**
 * @module useOfflineSync
 *
 * Manages the offline-first sync queue. Queues failed API requests locally
 * (IndexedDB) and automatically flushes them when connectivity returns.
 * Exposes `syncState`, `pendingCount`, and manual `flush()`.
 *
 * @param userId   - Current user ID
 * @param settings - Feature flag settings to check if offline mode is enabled
 * @returns `{ syncState, pendingCount, flush, lastSyncAt }`
 */
'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  flushOfflineQueue,
  getOfflineQueueSummary,
  getPendingCount,
  isOnline,
} from '@/lib/offline/offlineSync';
import type { SyncState } from '@/types/app';

interface UseOfflineSyncOptions {
  userId?: string | null;
  /** Settings object to check feature flags */
  settings?: Record<string, unknown> | null;
}

const DEFAULT_SYNC_STATE: SyncState = {
  online: true,
  syncing: false,
  pending: 0,
  failed: 0,
  due: 0,
};

export function useOfflineSync({ userId, settings }: UseOfflineSyncOptions = {}) {
  const [syncState, setSyncState] = useState<SyncState>(DEFAULT_SYNC_STATE);

  const refreshSyncState = useCallback(async () => {
    try {
      const online = isOnline();
      const offlineSyncV2Enabled =
        settings?.featuresKillSwitch !== true && settings?.featureOfflineSyncV2 === true;

      if (offlineSyncV2Enabled) {
        const sum = await getOfflineQueueSummary({ userId: userId ?? undefined });
        if (sum?.ok) {
          setSyncState((prev) => ({
            ...prev,
            online: sum.online !== false,
            pending: Number(sum.pending || 0),
            failed: Number(sum.failed || 0),
            due: Number(sum.due || 0),
          }));
          return;
        }
      }

      const pending = await getPendingCount();
      setSyncState((prev) => ({ ...prev, online, pending, failed: 0, due: 0 }));
    } catch {
      setSyncState((prev) => ({ ...prev, online: isOnline() }));
    }
  }, [userId, settings]);

  const flushingRef = useRef(false)

  const runFlushQueue = useCallback(async () => {
    try {
      // Fix #8: Mutex — prevent concurrent flush operations
      if (flushingRef.current) return
      flushingRef.current = true
      if (!isOnline()) {
        setSyncState((prev) => ({ ...prev, online: false }));
        return;
      }
      setSyncState((prev) => ({ ...prev, syncing: true, online: true }));
      await flushOfflineQueue({ max: 8 });
    } finally {
      flushingRef.current = false
      setSyncState((prev) => ({ ...prev, syncing: false }));
      await refreshSyncState();
    }
  }, [refreshSyncState]);

  // Stable refs so listeners are registered exactly once (no churn from deps)
  const refreshRef = useRef(refreshSyncState)
  const flushRef = useRef(runFlushQueue)
  useEffect(() => { refreshRef.current = refreshSyncState }, [refreshSyncState])
  useEffect(() => { flushRef.current = runFlushQueue }, [runFlushQueue])

  // Listen for online/offline and queue change events
  useEffect(() => {
    refreshRef.current();
    const onChanged = () => refreshRef.current();
    const onOnline = () => flushRef.current();
    const onOffline = () => refreshRef.current();
    try {
      window.addEventListener('irontracks.offlineQueueChanged', onChanged);
      window.addEventListener('online', onOnline);
      window.addEventListener('offline', onOffline);
    } catch { /* SSR guard */ }
    return () => {
      try {
        window.removeEventListener('irontracks.offlineQueueChanged', onChanged);
        window.removeEventListener('online', onOnline);
        window.removeEventListener('offline', onOffline);
      } catch { /* SSR guard */ }
    };
  // intentional: listeners registered exactly once (mount-only). refreshRef and flushRef
  // are stable mutable refs updated on every render (lines above), so the callbacks
  // always call the latest version without causing listener churn.
  }, []);

  // Auto-flush every 15s if there are pending items
  useEffect(() => {
    if (!userId) return;
    if (!isOnline()) return;
    if ((syncState?.pending || 0) <= 0) return;
    const t = setInterval(() => { runFlushQueue(); }, 15_000);
    return () => clearInterval(t);
  }, [runFlushQueue, syncState?.pending, userId]);

  return { syncState, setSyncState, refreshSyncState, runFlushQueue };
}
