/**
 * @module useStudentControlNotice
 *
 * Student-side hook that watches their own active_workout_sessions row
 * for teacher control status changes (controlled_by / control_status).
 *
 * Returns the current control state so the student UI can:
 * - Show a consent banner (control_status = 'requested')
 * - Show a subtle badge (control_status = 'active')
 * - Know the teacher's name for display
 */
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js'
import { logError, logWarn } from '@/lib/logger'

export type ControlStatus = 'none' | 'requested' | 'active'

export interface StudentControlNotice {
  controlStatus: ControlStatus
  controlledById: string | null
  controlledByName: string | null
  /** Call to accept the teacher's control request */
  accept: () => Promise<void>
  /** Call to reject the teacher's control request */
  reject: () => Promise<void>
}

export function useStudentControlNotice(
  supabase: SupabaseClient | null,
  userId: string | undefined,
  hasActiveSession: boolean,
): StudentControlNotice {
  // Raw state from DB — only meaningful when hasActiveSession is true
  const [rawStatus, setRawStatus] = useState<ControlStatus>('none')
  const [rawControlledById, setRawControlledById] = useState<string | null>(null)
  const [rawControlledByName, setRawControlledByName] = useState<string | null>(null)

  // Derived: reset to 'none' when there is no active session
  const controlStatus: ControlStatus = hasActiveSession ? rawStatus : 'none'
  const controlledById = hasActiveSession ? rawControlledById : null
  const controlledByName = hasActiveSession ? rawControlledByName : null

  const channelRef = useRef<RealtimeChannel | null>(null)
  const resolvedNamesRef = useRef<Record<string, string>>({})

  const resolveTeacherName = useCallback(async (teacherId: string): Promise<string> => {
    if (resolvedNamesRef.current[teacherId]) return resolvedNamesRef.current[teacherId]
    if (!supabase) return 'Professor'
    try {
      const { data } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', teacherId)
        .maybeSingle()
      const name = String(data?.display_name ?? 'Professor')
      resolvedNamesRef.current[teacherId] = name
      return name
    } catch { return 'Professor' }
  }, [supabase])

  const applyRow = useCallback(async (row: {
    controlled_by?: string | null
    control_status?: string | null
  }) => {
    const by = row.controlled_by ? String(row.controlled_by) : null
    const st = row.control_status ? String(row.control_status) : null

    if (!by || !st) {
      setRawStatus('none')
      setRawControlledById(null)
      setRawControlledByName(null)
      return
    }

    const status: ControlStatus = st === 'requested' ? 'requested' : st === 'active' ? 'active' : 'none'
    setRawControlledById(by)
    setRawStatus(status)

    if (status !== 'none') {
      const name = await resolveTeacherName(by)
      setRawControlledByName(name)
    }
  }, [resolveTeacherName])

  // Load current state on mount (only when active session exists)
  useEffect(() => {
    if (!supabase || !userId || !hasActiveSession) return
    let cancelled = false

    const load = async () => {
      try {
        const { data } = await supabase
          .from('active_workout_sessions')
          .select('controlled_by, control_status')
          .eq('user_id', userId)
          .maybeSingle()
        if (!cancelled && data) await applyRow(data)
      } catch (e) { logError('useStudentControlNotice.load', e) }
    }
    load()
    return () => { cancelled = true }
  }, [supabase, userId, hasActiveSession, applyRow])

  // Realtime subscription for control status changes
  useEffect(() => {
    if (!supabase || !userId || !hasActiveSession) return
    let mounted = true

    try {
      const ch = supabase
        .channel(`student-control-notice:${userId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'active_workout_sessions',
            filter: `user_id=eq.${userId}`,
          },
          (payload: Record<string, unknown>) => {
            if (!mounted) return
            try {
              const newRow = payload?.new as Record<string, unknown> | null
              if (!newRow) return
              void applyRow({
                controlled_by: newRow.controlled_by ? String(newRow.controlled_by) : null,
                control_status: newRow.control_status ? String(newRow.control_status) : null,
              })
            } catch (e) { logError('useStudentControlNotice.realtimeHandler', e) }
          }
        )
        .subscribe()

      channelRef.current = ch
    } catch (e) { logError('useStudentControlNotice.subscribe', e) }

    return () => {
      mounted = false
      try {
        if (channelRef.current) {
          supabase.removeChannel(channelRef.current)
          channelRef.current = null
        }
      } catch (e) { logWarn('useStudentControlNotice', 'cleanup failed', { error: String(e) }) }
    }
  }, [supabase, userId, hasActiveSession, applyRow])

  const accept = useCallback(async () => {
    if (!userId || !rawControlledById) return
    try {
      const res = await fetch(`/api/teacher/control/${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'accept' }),
      })
      const json = await res.json() as { ok: boolean; error?: string }
      if (json.ok) {
        // Optimistic — Realtime will confirm shortly. If the backend rejected
        // (e.g. controlled_by was cleared meanwhile) the next Realtime UPDATE
        // will reset us to the correct state.
        setRawStatus('active')
      } else {
        logError('useStudentControlNotice.accept', new Error(json.error || 'accept failed'))
      }
    } catch (e) { logError('useStudentControlNotice.accept', e) }
  }, [userId, rawControlledById])

  const reject = useCallback(async () => {
    if (!userId) return
    try {
      const res = await fetch(`/api/teacher/control/${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject' }),
      })
      const json = await res.json() as { ok: boolean; error?: string }
      if (json.ok) {
        setRawStatus('none')
        setRawControlledById(null)
        setRawControlledByName(null)
      } else {
        logError('useStudentControlNotice.reject', new Error(json.error || 'reject failed'))
      }
    } catch (e) { logError('useStudentControlNotice.reject', e) }
  }, [userId])

  return { controlStatus, controlledById, controlledByName, accept, reject }
}
