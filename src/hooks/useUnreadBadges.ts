'use client'

import { useState, useEffect } from 'react'
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
        const { data, error } = await supabase
          .from('notifications')
          .select('id')
          .eq('user_id', userId)
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
  useEffect(() => {
    if (!userId) return

    const allowNotifyDm = userSettings ? userSettings.notifyDirectMessages !== false : true

    const channel = supabase
      .channel(`direct-messages-badge:${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'direct_messages' },
        async (payload) => {
          try {
            if (!allowNotifyDm) return
            const msg = payload.new
            if (!msg || msg.sender_id === userId) return

            const currentView = view
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

            if (onInAppNotify) {
              onInAppNotify({ text: preview, senderName, displayName: senderName, photoURL: null })
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
  }, [supabase, userId, userSettings, view, onInAppNotify])

  return {
    hasUnreadNotification,
    setHasUnreadNotification,
    hasUnreadChat,
    setHasUnreadChat,
  }
}
