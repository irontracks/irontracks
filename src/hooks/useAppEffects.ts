'use client'

import { useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { unlockAudio } from '@/lib/sounds'
import { logError } from '@/lib/logger'
import type { ActiveWorkoutSession, DirectChatState } from '@/types/app'
import type { SupabaseClient } from '@supabase/supabase-js'

// ────────────────────────────────────────────────────────────────
// Exported helpers (used by sibling hooks)
// ────────────────────────────────────────────────────────────────
export const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

export const parseStartedAtMs = (raw: unknown): number => {
  const direct = typeof raw === 'number' ? raw : Number(String(raw ?? '').trim())
  if (Number.isFinite(direct) && direct > 0) return direct
  try {
    const d = new Date(String(raw ?? ''))
    const t = d.getTime()
    return Number.isFinite(t) ? t : 0
  } catch {
    return 0
  }
}

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────
interface UseAppEffectsOptions {
  // User + auth
  userId: string | undefined
  authLoading: boolean

  // View
  view: string
  setView: (v: string) => void

  // Companion states for view safety net
  directChat: DirectChatState | null
  reportDataCurrent: unknown
  activeSession: ActiveWorkoutSession | null

  // Scroll
  mainScrollRef: React.RefObject<HTMLDivElement | null>

  // Admin
  restoreAdminPanelIfNeeded: () => void

  // Timer + session
  handleCloseTimer: () => void
  handleUpdateSessionLog: (key: string, log: Record<string, unknown>) => void
  setActiveSession: React.Dispatch<React.SetStateAction<ActiveWorkoutSession | null>>

  // VIP
  openVipView: () => void

  // Supabase
  supabase: SupabaseClient

  // Session clear
  clearClientSessionState: () => void
}

/**
 * Bundles ALL standalone effects from IronTracksAppClientImpl:
 * - VIP session storage check
 * - View safety net (reset to dashboard if companion state is null)
 * - Redirect to login when no user
 * - Preload common modal chunks
 * - Audio unlock on first interaction
 * - Auth state change listener
 * - Admin panel restore on visibility
 * - Scroll-to-top on active view
 * - handleStartFromRestTimer transition callback
 */
export function useAppEffects({
  userId,
  authLoading,
  view,
  setView,
  directChat,
  reportDataCurrent,
  activeSession,
  mainScrollRef,
  restoreAdminPanelIfNeeded,
  handleCloseTimer,
  handleUpdateSessionLog,
  setActiveSession,
  openVipView,
  supabase,
  clearClientSessionState,
}: UseAppEffectsOptions) {
  const router = useRouter()

  // ── VIP session storage check ─────────────────────────────────
   
  useEffect(() => {
    try {
      const flag = sessionStorage.getItem('irontracks_open_vip')
      if (!flag) return
      sessionStorage.removeItem('irontracks_open_vip')
      openVipView()
    } catch { }
  }, [openVipView])

  // ── View safety net — reset to dashboard if companion state is missing ──
  useEffect(() => {
    if (view === 'directChat' && !directChat) { setView('dashboard'); return }
    if (view === 'report' && !reportDataCurrent) { setView('dashboard'); return }
    if (view === 'active' && !activeSession) { setView('dashboard'); return }
    if (view === 'profile' && !userId) { setView('dashboard'); return }
  }, [view, directChat, activeSession, reportDataCurrent, userId, setView])

  // ── Redirect to login when no user ────────────────────────────
  useEffect(() => {
    if (authLoading) return
    if (userId) return
    const t = setTimeout(() => {
      try { window.location.replace('/?next=/dashboard') } catch { }
    }, 3000)
    return () => { clearTimeout(t) }
  }, [authLoading, userId, router])

  // ── Preload common modal chunks 1s after mount ────────────────
  useEffect(() => {
    const t = setTimeout(() => {
      void import('@/components/SettingsModal')
      void import('@/components/dashboard/WorkoutWizardModal')
      void import('@/components/HistoryList')
      void import('@/components/ActiveWorkout')
      void import('@/components/IncomingInviteModal')
      void import('@/components/InviteAcceptedModal')
    }, 1000)
    return () => clearTimeout(t)
  }, [])

  // ── Audio unlock on first user interaction ────────────────────
  useEffect(() => {
    const handler = () => { try { unlockAudio(); } catch { } }
    document.addEventListener('touchstart', handler, { once: true })
    document.addEventListener('click', handler, { once: true })
    return () => {
      document.removeEventListener('touchstart', handler)
      document.removeEventListener('click', handler)
    }
  }, [])

  // ── Auth state change listener ────────────────────────────────
  useEffect(() => {
    try {
      const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
        try {
          const ev = String(_event || '').toUpperCase()
          if (session && session.user?.id) return
          if (ev === 'SIGNED_OUT') {
            clearClientSessionState()
            if (typeof window !== 'undefined') window.location.href = '/?next=/dashboard'
            return
          }
          if (ev === 'INITIAL_SESSION') {
            fetch('/api/auth/ping', { method: 'GET', credentials: 'include', cache: 'no-store' })
              .then((r) => {
                if (r && r.status === 204) return
                clearClientSessionState()
                if (typeof window !== 'undefined') window.location.href = '/?next=/dashboard'
              })
              .catch(() => { })
            return
          }
        } catch (e) { logError('IronTracksApp.authStateChange', e) }
      })
      return () => {
        try { sub?.subscription?.unsubscribe?.() } catch { }
      }
    } catch (e) {
      logError('IronTracksApp.authSubscribe', e)
      return
    }
  }, [supabase, clearClientSessionState])

  // ── Admin panel restore on visibility change ──────────────────
  useEffect(() => {
    restoreAdminPanelIfNeeded()
    const onVisibility = () => {
      if (typeof document === 'undefined') return
      if (document.visibilityState === 'visible') restoreAdminPanelIfNeeded()
    }
    const onPageShow = () => restoreAdminPanelIfNeeded()
    try {
      document.addEventListener('visibilitychange', onVisibility)
      window.addEventListener('pageshow', onPageShow)
    } catch { }
    return () => {
      try {
        document.removeEventListener('visibilitychange', onVisibility)
        window.removeEventListener('pageshow', onPageShow)
      } catch { }
    }
  }, [restoreAdminPanelIfNeeded])

  // ── Scroll to top when entering active workout view ───────────
  useEffect(() => {
    if (view !== 'active') return
    const scrollToTop = () => {
      const node = mainScrollRef.current
      if (node) node.scrollTo({ top: 0, left: 0, behavior: 'auto' })
      if (typeof window !== 'undefined') window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    }
    const raf = requestAnimationFrame(scrollToTop)
    const t = window.setTimeout(scrollToTop, 120)
    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(t)
    }
  }, [view, activeSession?.id, mainScrollRef])

  // ── Handler: transition from rest timer back to active set ────
  const handleStartFromRestTimer = useCallback(
    (ctx?: unknown) => {
      const nowMs = Date.now()
      const ctxObj = isRecord(ctx) ? (ctx as Record<string, unknown>) : null
      const prevKey = ctxObj ? String(ctxObj.key ?? '').trim() : ''
      const nextKey = ctxObj ? String(ctxObj.nextKey ?? '').trim() : ''
      const restStartedRaw = ctxObj ? ctxObj.restStartedAtMs : null
      const restStartedAtMs = typeof restStartedRaw === 'number' ? restStartedRaw : Number(String(restStartedRaw ?? '').trim())

      if (prevKey) {
        const logsObj = isRecord(activeSession?.logs) ? (activeSession?.logs as Record<string, unknown>) : {}
        const prevLog = logsObj[prevKey]
        const prevLogObj = isRecord(prevLog) ? (prevLog as Record<string, unknown>) : {}
        const completedRaw = prevLogObj.completedAtMs
        const completedAtMs = typeof completedRaw === 'number' ? completedRaw : Number(String(completedRaw ?? '').trim())
        const base = restStartedAtMs > 0 ? restStartedAtMs : completedAtMs > 0 ? completedAtMs : 0
        const restSeconds = base > 0 ? Math.max(0, Math.round((nowMs - base) / 1000)) : null
        if (restSeconds != null) {
          handleUpdateSessionLog(prevKey, { ...prevLogObj, restSeconds })
        }
      }

      if (nextKey) {
        const logsObj = isRecord(activeSession?.logs) ? (activeSession?.logs as Record<string, unknown>) : {}
        const nextLog = logsObj[nextKey]
        const nextLogObj = isRecord(nextLog) ? (nextLog as Record<string, unknown>) : {}
        if (!Boolean(nextLogObj.done)) {
          handleUpdateSessionLog(nextKey, { ...nextLogObj, startedAtMs: nowMs })
          setActiveSession((prev) => {
            if (!prev) return prev
            const base = prev && typeof prev === 'object' ? (prev as Record<string, unknown>) : {}
            const ui = isRecord(base.ui) ? (base.ui as Record<string, unknown>) : {}
            return { ...(prev as Record<string, unknown>), ui: { ...ui, activeExecution: { key: nextKey, startedAtMs: nowMs } } } as unknown as ActiveWorkoutSession
          })
        }
      }

      handleCloseTimer()
    },
    [activeSession?.logs, handleCloseTimer, handleUpdateSessionLog, setActiveSession]
  )

  return { handleStartFromRestTimer }
}
