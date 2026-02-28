'use client'

import { useCallback, useTransition } from 'react'
import { isIosNative } from '@/utils/platform'

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
  const hideVipOnIos = isIosNative()

  const openVipView = useCallback(() => {
    if (hideVipOnIos) return
    startViewTransition(() => setView('vip'))
  }, [hideVipOnIos, startViewTransition, setView])

  const handleOpenHistory = useCallback(() => {
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
    } catch { }
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
