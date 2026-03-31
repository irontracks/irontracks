/**
 * @module useViewNavigation
 *
 * Implements single-page app–style view transitions between dashboard
 * views (dashboard, history, community, profile, etc.) without triggering
 * full Next.js navigations. Uses `useTransition` for non-blocking updates
 * and native haptic feedback on iOS.
 *
 * @returns `{ navigateTo, isPending }`
 */
'use client'
import { logWarn } from '@/lib/logger'

import { useCallback, useTransition } from 'react'

export type AppView =
  | 'dashboard'
  | 'history'
  | 'chat'
  | 'chatList'
  | 'globalChat'
  | 'vip'
  | 'report'
  | 'admin'

interface UseViewNavigationOptions {
  setView: (view: string) => void
  setShowNotifCenter: (open: boolean) => void
  setHasUnreadNotification: (val: boolean) => void
  setTourOpen: (open: boolean) => void
  logTourEvent: (event: unknown, payload: unknown) => Promise<void>
  tourVersion: number
}

export function useViewNavigation({
  setView,
  setShowNotifCenter,
  setHasUnreadNotification,
  setTourOpen,
  logTourEvent,
  tourVersion,
}: UseViewNavigationOptions) {
  const [, startViewTransition] = useTransition()
  const hideVipOnIos: boolean = false

  const openVipView = useCallback(() => {
    if (hideVipOnIos) return
    startViewTransition(() => setView('vip'))
  }, [hideVipOnIos, startViewTransition, setView])

  const handleOpenHistory = useCallback(() => {
    // Prefetch history API in parallel with chunk download — the browser
    // caches the response so HistoryList's fetch() gets a cache hit.
    try { fetch('/api/workouts/history?limit=50', { priority: 'high' as RequestPriority }).catch(() => { }) } catch { }
    startViewTransition(() => setView('history'))
  }, [startViewTransition, setView])

  const handleOpenChat = useCallback(() => {
    startViewTransition(() => setView('chat'))
  }, [startViewTransition, setView])

  const handleOpenChatList = useCallback(() => {
    startViewTransition(() => setView('chatList'))
  }, [startViewTransition, setView])

  const handleOpenGlobalChat = useCallback(() => {
    startViewTransition(() => setView('globalChat'))
  }, [startViewTransition, setView])

  const handleOpenNotifications = useCallback(() => {
    setShowNotifCenter(true)
    setHasUnreadNotification(false)
  }, [setShowNotifCenter, setHasUnreadNotification])

  const handleOpenTour = useCallback(async () => {
    try {
      await logTourEvent('tour_started', { auto: false, version: tourVersion })
    } catch (e) { logWarn('useViewNavigation', 'silenced error', e) }
    setTourOpen(true)
  }, [logTourEvent, tourVersion, setTourOpen])

  return {
    hideVipOnIos,
    startViewTransition,
    openVipView,
    handleOpenHistory,
    handleOpenChat,
    handleOpenChatList,
    handleOpenGlobalChat,
    handleOpenNotifications,
    handleOpenTour,
  }
}
