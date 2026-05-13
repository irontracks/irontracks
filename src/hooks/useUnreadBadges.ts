/**
 * @module useUnreadBadges
 *
 * Tracks unread notification counts per category (coach messages,
 * system alerts, workout invites). Polls the backend periodically
 * and exposes `markAsRead` to clear individual categories.
 *
 * @param userId - Current user ID
 * @returns `{ badges, markAsRead, totalUnread }`
 */
'use client'

import { useState, useEffect, useRef } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { logError } from '@/lib/logger'

interface UseUnreadBadgesOptions {
  userId?: string | null
  supabase: SupabaseClient
  /** Current view name, used to suppress DM badge when chat is open */
  view?: string
  /** User settings object to check notifyDirectMessages preference */
  userSettings?: Record<string, unknown> | null
  /** Called to deliver an in-app notification for new DMs */
  onInAppNotify?: (payload: unknown) => void
}

interface UseUnreadBadgesReturn {
  hasUnreadNotification: boolean
  setHasUnreadNotification: (v: boolean) => void
  hasUnreadChat: boolean
  setHasUnreadChat: (v: boolean) => void
}

/**
 * Tracks unread notification and direct-message badges
 * via Supabase Realtime postgres_changes subscriptions.
 */
export function useUnreadBadges({
  userId,
  supabase,
  view,
  userSettings,
  onInAppNotify,
}: UseUnreadBadgesOptions): UseUnreadBadgesReturn {
  const [hasUnreadNotification, setHasUnreadNotification] = useState(false)
  const [hasUnreadChat, setHasUnreadChat] = useState(false)

  // Refs reais pra `view`, `userSettings` e `onInAppNotify` — atualizadas via
  // effect espelho. Sem isso, o canal Realtime de DM era resubscrito a cada
  // troca de view (`dashboard` → `history` etc), gerando round-trip WS Supabase
  // por click. O `viewRef = { current: view }` antigo NÃO era ref real (era
  // objeto recriado a cada execução do effect).
  const viewRef = useRef(view)
  const userSettingsRef = useRef(userSettings)
  const onInAppNotifyRef = useRef(onInAppNotify)
  useEffect(() => { viewRef.current = view }, [view])
  useEffect(() => { userSettingsRef.current = userSettings }, [userSettings])
  useEffect(() => { onInAppNotifyRef.current = onInAppNotify }, [onInAppNotify])

  // ─── Notification badge ───────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    if (!userId) {
      const timer = setTimeout(() => {
        if (!cancelled) setHasUnreadNotification(false)
      }, 0)
      return () => {
        cancelled = true
        clearTimeout(timer)
      }
    }

    const loadInitial = async () => {
      try {
        // Only count truly unread notifications — is_read is the canonical field
        // (all API insert routes set is_read: false explicitly)
        const { data, error } = await supabase
          .from('notifications')
          .select('id')
          .eq('user_id', userId)
          .eq('is_read', false)
          .limit(1)

        if (cancelled) return

        if (error) {
          logError('useUnreadBadges:notifications', error)
          setHasUnreadNotification(false)
          return
        }
        setHasUnreadNotification(Array.isArray(data) && data.length > 0)
      } catch (e) {
        if (cancelled) return
        logError('useUnreadBadges:notifications', e)
        setHasUnreadNotification(false)
      }
    }

    loadInitial()

    const channel = supabase
      .channel(`notifications:badge:${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        () => { if (!cancelled) setHasUnreadNotification(true) },
      )
      .on(
        'postgres_changes',
        // Re-check when a notification is updated (e.g., marked as read) or deleted
        { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        () => { if (!cancelled) loadInitial() },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        () => { if (!cancelled) loadInitial() },
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [supabase, userId])

  // ─── Direct-message badge ─────────────────────────────────────────────────
  // Deps: apenas [supabase, userId]. `view`/`userSettings`/`onInAppNotify` são
  // lidos via refs no handler — assim o canal NÃO é resubscrito a cada troca
  // de view nem a cada novo callback.
  useEffect(() => {
    if (!userId) return

    const channel = supabase
      .channel(`direct-messages-badge:${userId}`)
      .on(
        'postgres_changes',
        // R7#1: Filter by receiver — without this, ALL DM inserts for ALL users
        // are delivered to every connected client (privacy leak + bandwidth waste)
        { event: 'INSERT', schema: 'public', table: 'direct_messages', filter: `receiver_id=eq.${userId}` },
        async (payload) => {
          try {
            const settings = userSettingsRef.current
            const allowNotifyDm = settings ? settings.notifyDirectMessages !== false : true
            if (!allowNotifyDm) return
            const msg = payload.new
            if (!msg || msg.sender_id === userId) return

            const currentView = viewRef.current
            if (
              currentView === 'chat' ||
              currentView === 'chatList' ||
              currentView === 'directChat' ||
              currentView === 'globalChat'
            ) return

            const { data: senderProfile } = await supabase
              .from('profiles')
              .select('display_name')
              .eq('id', msg.sender_id)
              .maybeSingle()

            const senderName = senderProfile?.display_name || 'Nova mensagem'
            const preview = String(msg.content || '').slice(0, 120)
            if (!preview) return

            await fetch('/api/notifications/direct-message', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ receiverId: userId, senderName, preview }),
            })

            const notify = onInAppNotifyRef.current
            if (notify) {
              notify({ text: preview, senderName, displayName: senderName, photoURL: null })
            }
          } catch (e) {
            logError('useUnreadBadges:dm', e)
          }
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, userId])

  return {
    hasUnreadNotification,
    setHasUnreadNotification,
    hasUnreadChat,
    setHasUnreadChat,
  }
}
