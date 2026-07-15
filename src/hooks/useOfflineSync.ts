/**
 * @module useOfflineSync
 *
 * Manages the offline-first sync queue. Queues failed API requests locally
 * (IndexedDB) and automatically flushes them when connectivity returns.
 * Exposes `syncState`, `pendingCount`, and manual `flush()`.
 *
 * @param userId   - Current user ID
 * @returns `{ syncState, pendingCount, flush, lastSyncAt }`
 */
'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  flushOfflineQueue,
  getPendingCount,
  isOnline,
  setOfflineUser,
} from '@/lib/offline/offlineSync';
import type { SyncState } from '@/types/app';

interface UseOfflineSyncOptions {
  userId?: string | null;
}

const DEFAULT_SYNC_STATE: SyncState = {
  online: true,
  syncing: false,
  pending: 0,
  failed: 0,
  due: 0,
};

export function useOfflineSync({ userId }: UseOfflineSyncOptions = {}) {
  const [syncState, setSyncState] = useState<SyncState>(DEFAULT_SYNC_STATE);

  // Informa ao módulo de sync quem é o usuário atual do device — usado pra carimbar o
  // dono nos jobs e pra o flush NÃO reenviar job de outro usuário (device compartilhado).
  useEffect(() => { setOfflineUser(userId ?? null); }, [userId]);
  // Ref do userId pros listeners mount-only (online) poderem checar a identidade atual.
  const userIdRef = useRef<string | null>(userId ?? null);
  useEffect(() => { userIdRef.current = userId ?? null; }, [userId]);

  const refreshSyncState = useCallback(async () => {
    try {
      const online = isOnline();
      const pending = await getPendingCount();
      setSyncState((prev) => ({ ...prev, online, pending, failed: 0, due: 0 }));
    } catch {
      setSyncState((prev) => ({ ...prev, online: isOnline() }));
    }
  }, []);

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
    // Só faz flush ao voltar online se há usuário resolvido — senão o flush dispararia
    // deslogado (401 → antes marcava terminal) ou com a sessão de outro usuário.
    const onOnline = () => { if (userIdRef.current) flushRef.current(); };
    const onOffline = () => refreshRef.current();
    try {
      window.addEventListener('irontracks.offlineQueueChanged', onChanged);
      window.addEventListener('online', onOnline);
      window.addEventListener('offline', onOffline);
    } catch { /* SSR guard */ }
    return () => {
      // Reset mutex on unmount so subsequent mounts can flush again
      flushingRef.current = false
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

  // Auto-flush every 15s if there are pending items.
  // B-008: pausa o interval quando aba fica em background (drenava bateria + dados móveis).
  // Ao retornar pra visible, dispara 1 flush imediato em vez de esperar próximo tick.
  useEffect(() => {
    if (!userId) return;
    if (!isOnline()) return;
    if ((syncState?.pending || 0) <= 0) return;

    let intervalId: ReturnType<typeof setInterval> | null = null;
    const tick = () => { flushRef.current(); };
    const start = () => {
      if (intervalId !== null) return;
      intervalId = setInterval(tick, 15_000);
    };
    const stop = () => {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };
    const onVisibilityChange = () => {
      if (typeof document === 'undefined') return;
      if (document.hidden) {
        stop();
      } else {
        tick();
        start();
      }
    };

    if (typeof document === 'undefined' || !document.hidden) start();
    try {
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', onVisibilityChange);
      }
    } catch { /* SSR guard */ }

    return () => {
      stop();
      try {
        if (typeof document !== 'undefined') {
          document.removeEventListener('visibilitychange', onVisibilityChange);
        }
      } catch { /* SSR guard */ }
    };
  // flushRef é stable ref atualizada a cada render (linha 91), garantindo que o tick
  // sempre chame a versão mais recente de runFlushQueue sem causar reset do interval.
  }, [syncState?.pending, userId]);

  return { syncState, setSyncState, refreshSyncState, runFlushQueue };
}
