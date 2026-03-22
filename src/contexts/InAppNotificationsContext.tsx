"use client";

import type { SocialNotificationType } from '@/types/social'
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { useUserSettings } from '@/hooks/useUserSettings';
import { logError } from '@/lib/logger'
import RealtimeNotificationBridge from '@/components/RealtimeNotificationBridge';
import NotificationToast from '@/components/NotificationToast';

/* ──────────────────────────────────────────────────────────
 * InAppNotificationsContext
 *
 * Fixes applied:
 * - Toast QUEUE (up to 3 simultaneous)
 * - Dedup window reduced to 500ms
 * - Default duration 5000ms
 * - Auto-dismiss per toast via individual IDs
 * ────────────────────────────────────────────────────────── */

interface ToastPayload {
  id?: string | null
  text?: string
  message?: string
  senderName?: string
  title?: string
  displayName?: string
  type?: SocialNotificationType | string
  link?: string
  photoURL?: string | null
}

interface NormalizedToast {
  queueId: string  // internal queue key
  id?: string
  text: string
  senderName: string
  displayName: string
  type: SocialNotificationType | string
  link?: string
  photoURL: string | null
}

interface InAppNotificationsContextValue {
  notify: (payload: ToastPayload) => void
  clear: () => void
}

interface InAppNotificationsProviderProps {
  children: React.ReactNode
  userId?: string
  settings?: Record<string, unknown>
  durationMs?: number
  disableRealtime?: boolean
  onOpenMessages?: () => void
  onOpenNotifications?: () => void
}

const InAppNotificationsContext = createContext<InAppNotificationsContextValue>({ notify: () => { }, clear: () => { } });

export function useInAppNotifications() {
  return useContext(InAppNotificationsContext);
}

let queueCounter = 0

const normalizeToast = (raw: ToastPayload): NormalizedToast | null => {
  const n = raw && typeof raw === 'object' ? raw : null;
  if (!n) return null;
  const text = String(n.text ?? n.message ?? '').trim();
  const senderName = String(n.senderName ?? n.title ?? n.displayName ?? '').trim();
  const displayName = String(n.displayName ?? n.title ?? n.senderName ?? '').trim();
  const type = String(n.type ?? 'broadcast').trim().toLowerCase();
  const id = n.id ? String(n.id) : '';
  const link = n.link ? String(n.link) : '';
  const photoURL = n.photoURL ? String(n.photoURL).trim() : '';
  if (!text) return null;
  return {
    queueId: `toast_${++queueCounter}_${Date.now()}`,
    id: id || undefined,
    text,
    senderName: senderName || 'Aviso do Sistema',
    displayName: displayName || senderName || 'Sistema',
    type,
    link: link || undefined,
    photoURL: photoURL || null,
  };
};

const MAX_TOASTS = 3
const DEDUP_WINDOW_MS = 500

export function InAppNotificationsProvider(props: InAppNotificationsProviderProps) {
  const router = useRouter();
  const supabase = useMemo(() => {
    try {
      return createClient();
    } catch {
      return null;
    }
  }, []);

  const userIdProp = props?.userId ? String(props.userId) : '';
  const [authUserId, setAuthUserId] = useState('');
  const resolvedUserId = userIdProp || authUserId;

  useEffect(() => {
    if (!supabase) return;
    if (userIdProp) return;
    if (authUserId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const id = data?.session?.user?.id ? String(data.session.user.id) : '';
        if (!cancelled && id) setAuthUserId(id);
      } catch (e) { logError('InAppNotifications.getSession', e) }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, userIdProp, authUserId]);

  const settingsApi = useUserSettings(resolvedUserId);
  const settings = (props?.settings && typeof props.settings === 'object' ? props.settings : null) || settingsApi?.settings || null;

  const [toastQueue, setToastQueue] = useState<NormalizedToast[]>([]);
  const lastKeyRef = useRef({ key: '', at: 0 });

  const clear = useCallback(() => setToastQueue([]), []);

  const dismissOne = useCallback((queueId: string) => {
    setToastQueue(prev => prev.filter(t => t.queueId !== queueId))
  }, [])

  const notify = useCallback((payload: ToastPayload) => {
    const normalized = normalizeToast(payload);
    if (!normalized) return;
    // Dedup: skip if same message within DEDUP_WINDOW_MS
    const key = normalized.id ? `id:${normalized.id}` : `t:${normalized.type}|m:${normalized.text}`;
    const now = Date.now();
    const last = lastKeyRef.current || { key: '', at: 0 };
    if (last.key === key && now - last.at < DEDUP_WINDOW_MS) return;
    lastKeyRef.current = { key, at: now };
    setToastQueue(prev => {
      // Trim to max — remove oldest if over limit
      const trimmed = prev.length >= MAX_TOASTS ? prev.slice(1) : prev
      return [...trimmed, normalized]
    });
  }, []);

  const onToastClick = useCallback((toast: NormalizedToast) => {
    const n = toast && typeof toast === 'object' ? toast : null;
    if (!n) {
      dismissOne(toast.queueId);
      return;
    }
    const type = String(n.type || '').toLowerCase();
    const link = n.link ? String(n.link) : '';
    try {
      if (type === 'message' && typeof props?.onOpenMessages === 'function') {
        props.onOpenMessages();
        dismissOne(toast.queueId);
        return;
      }
    } catch { }
    try {
      if (link) {
        router.push(link);
        dismissOne(toast.queueId);
        return;
      }
    } catch { }
    try {
      if (typeof props?.onOpenNotifications === 'function') {
        props.onOpenNotifications();
        dismissOne(toast.queueId);
        return;
      }
    } catch { }
    dismissOne(toast.queueId);
  }, [dismissOne, props, router]);

  const durationMs = Number(props?.durationMs ?? 5000)

  return (
    <InAppNotificationsContext.Provider value={{ notify, clear }}>
      {resolvedUserId && props?.disableRealtime !== true ? (
        <RealtimeNotificationBridge userId={resolvedUserId} setNotification={notify} />
      ) : null}
      {/* Toast queue — renders up to MAX_TOASTS simultaneously */}
      <div
        className="fixed top-0 right-0 z-[999999] flex flex-col gap-2 pointer-events-none"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)', paddingRight: '16px' }}
      >
        {toastQueue.map((toast) => (
          <div key={toast.queueId} className="pointer-events-auto">
            <NotificationToast
              settings={settings}
              notification={toast as unknown as Record<string, unknown>}
              durationMs={durationMs}
              onClick={() => onToastClick(toast)}
              onClose={() => dismissOne(toast.queueId)}
            />
          </div>
        ))}
      </div>
      {props?.children}
    </InAppNotificationsContext.Provider>
  );
}
