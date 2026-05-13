/**
 * @module useViewNavigation
 *
 * Navegação entre views do dashboard (history, chat, vip, report, etc).
 *
 * PR#4a refactor: hooks agora usam `router.push()` direto em vez de
 * `setView('xxx')`. Sub-rotas reais existem em
 * `src/app/(app)/dashboard/{history,active,report,chat,profile}/page.tsx`.
 *
 * `useTransition` envolve a navegação pra render não-blocking.
 *
 * @returns handlers de navegação memoizados
 */
'use client'
import { logWarn } from '@/lib/logger'

import { useCallback, useTransition } from 'react'
import { useRouter } from 'next/navigation'

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
  setShowNotifCenter: (open: boolean) => void
  setHasUnreadNotification: (val: boolean) => void
  setTourOpen: (open: boolean) => void
  logTourEvent: (event: unknown, payload: unknown) => Promise<void>
  tourVersion: number
}

export function useViewNavigation({
  setShowNotifCenter,
  setHasUnreadNotification,
  setTourOpen,
  logTourEvent,
  tourVersion,
}: UseViewNavigationOptions) {
  const router = useRouter()
  const [, startViewTransition] = useTransition()
  const hideVipOnIos: boolean = false

  const openVipView = useCallback(() => {
    if (hideVipOnIos) return
    startViewTransition(() => router.push('/dashboard/vip'))
  }, [hideVipOnIos, startViewTransition, router])

  const handleOpenHistory = useCallback(() => {
    // Prefetch history API in parallel with chunk download — the browser
    // caches the response so HistoryList's fetch() gets a cache hit.
    try { fetch('/api/workouts/history?limit=50', { priority: 'high' as RequestPriority }).catch(() => { }) } catch { }
    startViewTransition(() => router.push('/dashboard/history'))
  }, [startViewTransition, router])

  const handleOpenChatList = useCallback(() => {
    startViewTransition(() => router.push('/dashboard/chat'))
  }, [startViewTransition, router])

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
    handleOpenChatList,
    handleOpenNotifications,
    handleOpenTour,
  }
}
