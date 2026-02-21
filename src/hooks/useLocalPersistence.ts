'use client'

import { useEffect } from 'react'
import type { ActiveWorkoutSession } from '@/types/app'

interface UseLocalPersistenceOptions {
  userId?: string | null
  view: string
  setView: (view: string) => void
  activeSession: ActiveWorkoutSession | null
}

/**
 * Persists and restores the current view and active session
 * to/from localStorage, keeping the UI state across page refreshes.
 *
 * - On mount: restores saved view (respecting any active session key)
 * - On view change: saves the current view
 * - On activeSession change: saves or removes the active session payload
 */
export function useLocalPersistence({
  userId,
  view,
  setView,
  activeSession,
}: UseLocalPersistenceOptions): void {
  // ─── Restore view on mount ────────────────────────────────────────────────
  useEffect(() => {
    try {
      if (!userId) return
      const scopedViewKey = `irontracks.appView.v2.${userId}`
      const scopedSessionKey = `irontracks.activeSession.v2.${userId}`

      const savedSession = localStorage.getItem(scopedSessionKey)
      if (savedSession) {
        setView('active')
        return
      }

      const raw = localStorage.getItem(scopedViewKey) || localStorage.getItem('appView')
      const savedView = raw ? String(raw) : ''
      if (!savedView) {
        setView('dashboard')
        return
      }

      // Never restore to 'active' without a real session — go to dashboard instead
      if (savedView === 'active') {
        setView('dashboard')
        return
      }

      setView(savedView)
    } catch {
      setView('dashboard')
    }
    // Intentionally only on mount (userId change) — not on every view change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  // ─── Persist current view on every change ────────────────────────────────
  useEffect(() => {
    try {
      if (!userId) return
      if (!view) return
      localStorage.setItem(`irontracks.appView.v2.${userId}`, view)
    } catch { }
  }, [view, userId])

  // ─── Persist active session (debounced 250 ms) ───────────────────────────
  useEffect(() => {
    try {
      if (!userId) return
      const key = `irontracks.activeSession.v2.${userId}`
      if (!activeSession) {
        localStorage.removeItem(key)
        localStorage.removeItem('activeSession')
        return
      }

      const payload = JSON.stringify({ ...(activeSession || {}), _savedAt: Date.now() })
      const id = setTimeout(() => {
        try {
          localStorage.setItem(key, payload)
        } catch { }
      }, 250)
      return () => clearTimeout(id)
    } catch {
      return
    }
  }, [activeSession, userId])
}
