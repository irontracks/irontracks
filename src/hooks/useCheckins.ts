/**
 * @module useCheckins
 *
 * Fetches and caches pre-workout and post-workout checkin data for a user.
 * Tracks energy levels, soreness, sleep quality, and session notes over time.
 * Used by the workout report and analytics dashboard.
 *
 * @param supabase - Supabase client instance
 * @param userId   - Current user ID
 * @returns `{ checkins, isLoading, refetch }`
 */
'use client'
import { useState, useEffect } from 'react'
import { logWarn } from '@/lib/logger'
import type { SupabaseClient } from '@supabase/supabase-js'

type AnyObj = Record<string, unknown>

const toDateMs = (v: unknown): number | null => {
  try {
    if (!v) return null
    const ms = new Date(v as string | number | Date).getTime()
    return Number.isFinite(ms) ? ms : null
  } catch { return null }
}

interface UseCheckinsParams {
  workoutId: string | null | undefined
  targetUserId: string | null
  supabase: SupabaseClient | null
  sessionDate: unknown
  sessionCompletedAt: unknown
  originWorkoutId: string | null | undefined
}

interface UseCheckinsReturn {
  preCheckin: AnyObj | null
  postCheckin: AnyObj | null
}

/**
 * Fetches pre/post check-ins for a given workout session.
 * Performs a primary lookup by workout_id, then a secondary lookup
 * for the pre check-in via planned_workout_id + time window.
 */
export const useCheckins = ({
  workoutId,
  targetUserId,
  supabase,
  sessionDate,
  sessionCompletedAt,
  originWorkoutId,
}: UseCheckinsParams): UseCheckinsReturn => {
  const [checkinsByKind, setCheckinsByKind] = useState<{ pre: AnyObj | null; post: AnyObj | null }>({ pre: null, post: null })

  useEffect(() => {
    const id = workoutId ? String(workoutId) : ''
    if (!id || !supabase) {
      const timer = setTimeout(() => { setCheckinsByKind({ pre: null, post: null }) }, 0)
      return () => { clearTimeout(timer) }
    }

    const baseMs = toDateMs(sessionDate) ?? toDateMs(sessionCompletedAt) ?? Date.now()
    const validBaseMs = Number.isFinite(baseMs) ? baseMs : null
    const windowStartIso = validBaseMs ? new Date(validBaseMs - 12 * 60 * 60 * 1000).toISOString() : null
    const windowEndIso = validBaseMs ? new Date(validBaseMs + 2 * 60 * 60 * 1000).toISOString() : null

    let cancelled = false
    ;(async () => {
      try {
        const { data } = await supabase
          .from('workout_checkins')
          .select('kind, energy, mood, soreness, notes, answers, created_at')
          .eq('workout_id', id)
          .order('created_at', { ascending: true })
          .limit(10)

        if (cancelled) return

        const rows = Array.isArray(data) ? data : []
        const next: { pre: AnyObj | null; post: AnyObj | null } = { pre: null, post: null }
        rows.forEach((r) => {
          const row = r && typeof r === 'object' ? (r as AnyObj) : null
          if (!row) return
          const kind = String(row?.kind || '').trim()
          if (kind === 'pre') next.pre = row
          if (kind === 'post') next.post = row
        })

        // Secondary lookup: pre check-in may be linked to planned_workout_id
        if (!next.pre && originWorkoutId && targetUserId && windowStartIso && windowEndIso) {
          try {
            const { data: preRow } = await supabase
              .from('workout_checkins')
              .select('kind, energy, mood, soreness, notes, answers, created_at')
              .eq('user_id', targetUserId)
              .eq('kind', 'pre')
              .eq('planned_workout_id', originWorkoutId)
              .gte('created_at', windowStartIso)
              .lte('created_at', windowEndIso)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle()
            if (!cancelled && preRow) next.pre = preRow as AnyObj
          } catch (e) { logWarn('useCheckins', 'secondary pre-checkin lookup failed', e) }
        }

        setCheckinsByKind(next)
      } catch {
        if (!cancelled) setCheckinsByKind({ pre: null, post: null })
      }
    })()

    return () => { cancelled = true }
  }, [workoutId, originWorkoutId, sessionDate, sessionCompletedAt, supabase, targetUserId])

  return { preCheckin: checkinsByKind.pre, postCheckin: checkinsByKind.post }
}
