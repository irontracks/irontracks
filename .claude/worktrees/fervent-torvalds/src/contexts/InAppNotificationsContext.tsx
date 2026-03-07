"use client";

import type { SocialNotificationType } from '@/types/social'
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { useUserSettings } from '@/hooks/useUserSettings';
import RealtimeNotificationBridge from '@/components/RealtimeNotificationBridge';
import NotificationToast from '@/components/NotificationToast';

interface ToastPayload {
  id?: string
  text?: string
  message?: string
  senderName?: string
  title?: string
  displayName?: string
  type?: SocialNotificationType | string
  link?: string
  photoURL?: string
}

interface NormalizedToast {
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

const InAppNotificationsContext = createContext<InAppNotificationsContextValue>({ notify: () => {}, clear: () => {} });

export function useInAppNotifications() {
  return useContext(InAppNotificationsContext);
}

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
    id: id || undefined,
    text,
    senderName: senderName || 'Aviso do Sistema',
    displayName: displayName || senderName || 'Sistema',
    type,
    link: link || undefined,
    photoURL: photoURL || null,
  };
};

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
        const { data } = await supabase.auth.getUser();
        const id = data?.user?.id ? String(data.user.id) : '';
        if (!cancelled && id) setAuthUserId(id);
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, userIdProp, authUserId]);

  const settingsApi = useUserSettings(resolvedUserId);
  const settings = (props?.settings && typeof props.settings === 'object' ? props.settings : null) || settingsApi?.settings || null;

  const [toast, setToast] = useState<NormalizedToast | null>(null);
  const lastKeyRef = useRef({ key: '', at: 0 });

  const clear = useCallback(() => setToast(null), []);

  const notify = useCallback((payload: ToastPayload) => {
    const normalized = normalizeToast(payload);
    if (!normalized) return;
    const key = normalized.id ? `id:${normalized.id}` : `t:${normalized.type}|m:${normalized.text}`;
    const now = Date.now();
    const last = lastKeyRef.current || { key: '', at: 0 };
    if (last.key === key && now - last.at < 1500) return;
    lastKeyRef.current = { key, at: now };
    setToast(normalized);
  }, []);

  const onToastClick = useCallback(() => {
    const n = toast && typeof toast === 'object' ? toast : null;
    if (!n) {
      clear();
      return;
    }
    const type = String(n.type || '').toLowerCase();
    const link = n.link ? String(n.link) : '';
    try {
      if (type === 'message' && typeof props?.onOpenMessages === 'function') {
        props.onOpenMessages();
        clear();
        return;
      }
    } catch {}
    try {
      if (link) {
        router.push(link);
        clear();
        return;
      }
    } catch {}
    try {
      if (typeof props?.onOpenNotifications === 'function') {
        props.onOpenNotifications();
        clear();
        return;
      }
    } catch {}
    clear();
  }, [toast, clear, props, router]);

  return (
    <InAppNotificationsContext.Provider value={{ notify, clear }}>
      {resolvedUserId && props?.disableRealtime !== true ? (
        <RealtimeNotificationBridge userId={resolvedUserId} setNotification={notify} />
      ) : null}
      {toast ? (
        <NotificationToast
          settings={settings}
          notification={toast}
          durationMs={Number(props?.durationMs ?? 7000)}
          onClick={onToastClick}
          onClose={clear}
        />
      ) : null}
      {props?.children}
    </InAppNotificationsContext.Provider>
  );
}
