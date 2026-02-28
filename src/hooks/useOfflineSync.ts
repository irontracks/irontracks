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

  const runFlushQueue = useCallback(async () => {
    try {
      if (!isOnline()) {
        setSyncState((prev) => ({ ...prev, online: false }));
        return;
      }
      setSyncState((prev) => ({ ...prev, syncing: true, online: true }));
      await flushOfflineQueue({ max: 8 });
    } finally {
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
