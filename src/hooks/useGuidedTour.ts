'use client'

import { useState, useCallback, useEffect, type Dispatch, type SetStateAction } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { TourState } from '@/types/app'
import { parseJsonWithSchema } from '@/utils/zod'
import { z } from 'zod'

const TOUR_VERSION = 1

interface UseGuidedTourOptions {
  userId?: string | null
  userRole?: string | null
  userSettings?: Record<string, unknown> | null
  supabase: SupabaseClient
}

interface UseGuidedTourReturn {
  tourOpen: boolean
  setTourOpen: (open: boolean) => void
  tourBoot: TourState
  setTourBoot: Dispatch<SetStateAction<TourState>>
  TOUR_VERSION: number
  logTourEvent: (event: unknown, payload: unknown) => Promise<void>
  upsertTourFlags: (patch: unknown) => Promise<{ ok: boolean; error?: string }>
  writeLocalTourDismissal: (uid: unknown, status: unknown) => void
}

export function useGuidedTour({
  userId,
  userRole,
  userSettings,
  supabase,
}: UseGuidedTourOptions): UseGuidedTourReturn {
  const [tourOpen, setTourOpen] = useState(false)
  const [tourBoot, setTourBoot] = useState<TourState>({ loaded: false, completed: false, skipped: false })

  // ─── localStorage / sessionStorage key helpers ───────────────────────────
  const getTourLocalKey = useCallback((uid: unknown) => {
    const safeUid = uid ? String(uid) : ''
    return safeUid ? `irontracks.onboarding.tour.v${TOUR_VERSION}.dismissed.${safeUid}` : ''
  }, [])

  const getTourAutoOpenedKey = useCallback((uid: unknown) => {
    const safeUid = uid ? String(uid) : ''
    return safeUid ? `irontracks.onboarding.tour.v${TOUR_VERSION}.autoOpened.${safeUid}` : ''
  }, [])

  const getTourSeenKey = useCallback((uid: unknown) => {
    const safeUid = uid ? String(uid) : ''
    return safeUid ? `irontracks.onboarding.tour.v${TOUR_VERSION}.seen.${safeUid}` : ''
  }, [])

  const readLocalTourDismissal = useCallback(
    (uid: unknown) => {
      const safeUid = uid ? String(uid) : ''
      if (!safeUid) return null
      try {
        if (typeof window === 'undefined') return null
        const key = getTourLocalKey(safeUid)
        if (!key) return null
        const raw = window.localStorage.getItem(key) || ''
        if (!raw) return null
        const parsed = parseJsonWithSchema(raw, z.record(z.unknown()))
        if (!parsed || typeof parsed !== 'object') return null
        const version = Number(parsed?.version || 0) || 0
        if (version !== TOUR_VERSION) return null
        const status = String(parsed?.status || '')
        if (status !== 'completed' && status !== 'skipped') return null
        return { version, status, at: Number(parsed?.at || 0) || 0 }
      } catch {
        return null
      }
    },
    [getTourLocalKey],
  )

  const writeLocalTourDismissal = useCallback(
    (uid: unknown, status: unknown) => {
      const safeUid = uid ? String(uid) : ''
      if (!safeUid) return
      const safeStatus = status === 'completed' ? 'completed' : 'skipped'
      try {
        if (typeof window === 'undefined') return
        const key = getTourLocalKey(safeUid)
        if (!key) return
        window.localStorage.setItem(
          key,
          JSON.stringify({ version: TOUR_VERSION, status: safeStatus, at: Date.now() }),
        )
      } catch { }
    },
    [getTourLocalKey],
  )

  const wasTourSeenEver = useCallback(
    (uid: unknown) => {
      const safeUid = uid ? String(uid) : ''
      if (!safeUid) return false
      try {
        if (typeof window === 'undefined') return false
        const key = getTourSeenKey(safeUid)
        if (!key) return false
        return (window.localStorage.getItem(key) || '') === '1'
      } catch {
        return false
      }
    },
    [getTourSeenKey],
  )

  const markTourSeenEver = useCallback(
    (uid: unknown) => {
      const safeUid = uid ? String(uid) : ''
      if (!safeUid) return
      try {
        if (typeof window === 'undefined') return
        const key = getTourSeenKey(safeUid)
        if (!key) return
        window.localStorage.setItem(key, '1')
      } catch { }
    },
    [getTourSeenKey],
  )

  const wasTourAutoOpenedThisSession = useCallback(
    (uid: unknown) => {
      const safeUid = uid ? String(uid) : ''
      if (!safeUid) return false
      try {
        if (typeof window === 'undefined') return false
        const key = getTourAutoOpenedKey(safeUid)
        if (!key) return false
        return (window.sessionStorage.getItem(key) || '') === '1'
      } catch {
        return false
      }
    },
    [getTourAutoOpenedKey],
  )

  const markTourAutoOpenedThisSession = useCallback(
    (uid: unknown) => {
      const safeUid = uid ? String(uid) : ''
      if (!safeUid) return
      try {
        if (typeof window === 'undefined') return
        const key = getTourAutoOpenedKey(safeUid)
        if (!key) return
        window.sessionStorage.setItem(key, '1')
      } catch { }
    },
    [getTourAutoOpenedKey],
  )

  // ─── Supabase helpers ─────────────────────────────────────────────────────
  const logTourEvent = useCallback(
    async (event: unknown, payload: unknown) => {
      try {
        if (!userId) return
        const ev = String(event || '').trim()
        if (!ev) return
        const basePayload =
          payload && typeof payload === 'object'
            ? (payload as Record<string, unknown>)
            : ({} as Record<string, unknown>)
        const enriched = {
          ...basePayload,
          role: String(userRole || ''),
          path: (() => {
            try {
              return typeof window !== 'undefined' ? String(window.location.pathname || '') : ''
            } catch {
              return ''
            }
          })(),
        }
        await supabase.from('onboarding_events').insert({
          user_id: userId,
          event: ev,
          payload: enriched,
        })
      } catch { }
    },
    [supabase, userId, userRole],
  )

  const upsertTourFlags = useCallback(
    async (patch: unknown) => {
      try {
        if (!userId) return { ok: false, error: 'missing_user' }
        const base =
          patch && typeof patch === 'object'
            ? (patch as Record<string, unknown>)
            : ({} as Record<string, unknown>)
        const payload = {
          user_id: userId,
          preferences:
            userSettings && typeof userSettings === 'object' ? (userSettings as Record<string, unknown>) : {},
          tour_version: TOUR_VERSION,
          updated_at: new Date().toISOString(),
          ...base,
        }
        await supabase.from('user_settings').upsert(payload, { onConflict: 'user_id' })
        return { ok: true }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        return { ok: false, error: message }
      }
    },
    [supabase, userId, userSettings],
  )

  // ─── Boot effect: load from DB and auto-open if needed ───────────────────
  useEffect(() => {
    if (!userId) return
    let cancelled = false
      ; (async () => {
        try {
          const uid = String(userId)
          const localDismissal = readLocalTourDismissal(uid)
          if (localDismissal) {
            const completed = localDismissal.status === 'completed'
            const skipped = localDismissal.status === 'skipped'
            setTourBoot({ loaded: true, completed, skipped })
            return
          }

          const { data } = await supabase
            .from('user_settings')
            .select('tour_version, tour_completed_at, tour_skipped_at')
            .eq('user_id', userId)
            .maybeSingle()

          if (cancelled) return

          const dbVersion = Number(data?.tour_version || 0) || 0
          const needsNewVersion = dbVersion > 0 && dbVersion < TOUR_VERSION
          const completed = needsNewVersion ? false : !!data?.tour_completed_at
          const skipped = needsNewVersion ? false : !!data?.tour_skipped_at
          setTourBoot({ loaded: true, completed, skipped })

          const shouldOpen =
            !wasTourSeenEver(uid) &&
            !wasTourAutoOpenedThisSession(uid) &&
            !completed &&
            !skipped

          if (shouldOpen) {
            markTourAutoOpenedThisSession(uid)
            markTourSeenEver(uid)
            await logTourEvent('tour_started', { auto: true, version: TOUR_VERSION })
            setTourOpen(true)
          }
        } catch {
          if (!cancelled) setTourBoot((prev) => ({ ...prev, loaded: true }))
        }
      })()

    return () => {
      cancelled = true
    }
  }, [
    logTourEvent,
    markTourAutoOpenedThisSession,
    markTourSeenEver,
    readLocalTourDismissal,
    supabase,
    userId,
    wasTourAutoOpenedThisSession,
    wasTourSeenEver,
  ])

  return {
    tourOpen,
    setTourOpen,
    tourBoot,
    setTourBoot,
    TOUR_VERSION,
    logTourEvent,
    upsertTourFlags,
    writeLocalTourDismissal,
  }
}
