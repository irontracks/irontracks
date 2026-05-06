/**
 * @module useTeacherControl
 *
 * Teacher-side hook that loads and live-syncs a student's active workout session.
 * Mirrors useSessionSync but reads/writes the student's session via the teacher API.
 *
 * Key behaviors:
 * - Loads student session once on mount
 * - Subscribes to Realtime for live updates from the student's own changes
 * - Provides patchState() to write teacher changes back (with teacher's _deviceId)
 * - Self-echo guard prevents re-applying teacher's own writes
 */
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js'
import { logError, logWarn } from '@/lib/logger'
import type { ActiveWorkoutSession } from '@/types/app'

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

// Unique device ID for the teacher's current browser/app session
const TEACHER_DEVICE_ID: string = (() => {
  const KEY = 'irontracks._teacherDeviceId'
  try {
    const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null
    if (stored && stored.length > 8) return stored
  } catch { /* ignore */ }
  const id = (() => {
    try {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID()
      }
    } catch { /* fallback */ }
    return `teacher-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  })()
  try { localStorage.setItem(KEY, id) } catch { /* ignore */ }
  return id
})()

export interface UseTeacherControlResult {
  session: ActiveWorkoutSession | null
  isLoading: boolean
  isSaving: boolean
  patchState: (updater: (prev: ActiveWorkoutSession) => ActiveWorkoutSession) => void
}

export function useTeacherControl(
  supabase: SupabaseClient | null,
  studentUserId: string | null,
  getAuthHeaders: () => Promise<Record<string, string>>,
): UseTeacherControlResult {
  const [session, setSession] = useState<ActiveWorkoutSession | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const sessionRef = useRef<ActiveWorkoutSession | null>(null)
  sessionRef.current = session

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const lastTeacherSaveAtRef = useRef<number>(0)

  // Load the student's session on mount / when studentUserId changes
  useEffect(() => {
    if (!studentUserId) { setSession(null); return }
    let cancelled = false
    setIsLoading(true)

    const load = async () => {
      try {
        const headers = await getAuthHeaders()
        const res = await fetch(`/api/teacher/student-session/${studentUserId}`, {
          headers: { 'Content-Type': 'application/json', ...headers },
        })
        if (!res.ok || cancelled) return
        const json = await res.json() as { ok: boolean; session?: { state: Record<string, unknown> } }
        if (!json.ok || !json.session?.state) return
        const state = json.session.state
        if (!state.startedAt || !state.workout) return
        setSession(state as unknown as ActiveWorkoutSession)
      } catch (e) { logError('useTeacherControl.load', e) }
      finally { if (!cancelled) setIsLoading(false) }
    }
    load()
    return () => { cancelled = true }
  }, [studentUserId, getAuthHeaders])

  // Subscribe to Realtime for live updates from the student
  useEffect(() => {
    if (!supabase || !studentUserId) return
    let mounted = true

    try {
      const ch = supabase
        .channel(`teacher-control-view:${studentUserId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'active_workout_sessions',
            filter: `user_id=eq.${studentUserId}`,
          },
          (payload: Record<string, unknown>) => {
            if (!mounted) return
            try {
              const rowNew = isRecord(payload?.new) ? payload.new : null
              const stateRaw = rowNew?.state
              const state = isRecord(stateRaw) ? stateRaw : null
              if (!state || !state.startedAt || !state.workout) return

              // Self-echo guard: ignore our own writes
              const incomingDeviceId = String(state._deviceId ?? '')
              if (incomingDeviceId === TEACHER_DEVICE_ID) return

              // Secondary guard: reject stale echoes
              const incomingSavedAt = Number(state._savedAt ?? 0)
              if (incomingSavedAt > 0 && incomingSavedAt <= lastTeacherSaveAtRef.current) return

              setSession(state as unknown as ActiveWorkoutSession)
            } catch (e) { logError('useTeacherControl.realtimeHandler', e) }
          }
        )
        .subscribe()

      channelRef.current = ch
    } catch (e) { logError('useTeacherControl.subscribe', e) }

    return () => {
      mounted = false
      try {
        if (channelRef.current) {
          supabase.removeChannel(channelRef.current)
          channelRef.current = null
        }
      } catch (e) { logWarn('useTeacherControl', 'cleanup failed', { error: String(e) }) }
    }
  }, [supabase, studentUserId])

  // Debounced save to the student's session via teacher API
  const flushSave = useCallback(async (state: ActiveWorkoutSession) => {
    if (!studentUserId) return
    try {
      setIsSaving(true)
      const savedAt = Date.now()
      const patchedState = { ...state, _deviceId: TEACHER_DEVICE_ID, _savedAt: savedAt }
      const headers = await getAuthHeaders()
      const res = await fetch(`/api/teacher/student-session/${studentUserId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ state: patchedState }),
      })
      if (res.ok) {
        lastTeacherSaveAtRef.current = savedAt
      }
    } catch (e) { logError('useTeacherControl.flushSave', e) }
    finally { setIsSaving(false) }
  }, [studentUserId, getAuthHeaders])

  const patchState = useCallback((updater: (prev: ActiveWorkoutSession) => ActiveWorkoutSession) => {
    setSession(prev => {
      if (!prev) return prev
      const next = updater(prev)
      sessionRef.current = next

      // Debounce: cancel pending save and schedule new one
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => {
        const current = sessionRef.current
        if (current) flushSave(current)
      }, 800)

      return next
    })
  }, [flushSave])

  // Cleanup pending save on unmount
  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
  }, [])

  return { session, isLoading, isSaving, patchState }
}
