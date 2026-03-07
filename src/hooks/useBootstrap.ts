'use client'

import { useEffect } from 'react'
import type { UserRecord } from '@/types/app'
import { mapWorkoutRow } from '@/utils/mapWorkoutRow'

interface UseBootstrapOptions {
  userId: string | undefined
  setUser: React.Dispatch<React.SetStateAction<UserRecord | null>>
  setIsCoach: (v: boolean) => void
  setWorkouts: (w: Record<string, unknown>[]) => void
  setStats: (s: { workouts: number; exercises: number; activeStreak: number }) => void
}

/**
 * Fetches /api/dashboard/bootstrap once per user session and hydrates:
 * - user profile (displayName, photoURL, role)
 * - coach flag
 * - initial workout list + stats
 *
 * Extracted from IronTracksAppClientImpl to keep the root component lean.
 */
export function useBootstrap({
  userId,
  setUser,
  setIsCoach,
  setWorkouts,
  setStats,
}: UseBootstrapOptions) {
  useEffect(() => {
    if (!userId) return
    let cancelled = false

    const run = async () => {
      try {
        const res = await fetch('/api/dashboard/bootstrap', {
          cache: 'no-store',
          credentials: 'include',
        })
        const json = await res.json().catch((): unknown => null)
        if (cancelled) return

        const jsonObj =
          json && typeof json === 'object' ? (json as Record<string, unknown>) : null
        if (!jsonObj?.ok) return

        // ── Profile patch ────────────────────────────────────────────────
        const prof =
          jsonObj?.profile && typeof jsonObj.profile === 'object'
            ? (jsonObj.profile as Record<string, unknown>)
            : null
        const displayName = String(prof?.display_name || '').trim()
        const photoURL = String(prof?.photo_url || '').trim()
        const role = String(prof?.role || '').toLowerCase()

        setUser((prev: UserRecord | null) => {
          const current =
            prev && typeof prev === 'object' ? (prev as UserRecord) : null
          if (!current) return prev
          const patch: Record<string, unknown> = {}
          if (displayName && displayName !== String(current.displayName || ''))
            patch.displayName = displayName
          if (photoURL && photoURL !== String(current.photoURL || ''))
            patch.photoURL = photoURL
          if (role && role !== String(current.role || '').toLowerCase())
            patch.role = role
          return Object.keys(patch).length
            ? ({ ...current, ...patch } as UserRecord)
            : prev
        })

        if (role) setIsCoach(role === 'teacher' || role === 'admin')

        // ── Workout list ─────────────────────────────────────────────────
        const workoutsRaw = Array.isArray(jsonObj.workouts)
          ? (jsonObj.workouts as unknown[])
          : []
        if (workoutsRaw.length) {
          const mapped = workoutsRaw
            .map((row: unknown) => mapWorkoutRow(row))
            .filter(Boolean)
            .sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
              String(a.title || '').localeCompare(String(b.title || ''))
            )
          setWorkouts(mapped)
          const totalEx = mapped.reduce(
            (acc: number, w: Record<string, unknown>) =>
              acc + (Array.isArray(w?.exercises) ? (w.exercises as unknown[]).length : 0),
            0
          )
          setStats({ workouts: mapped.length, exercises: totalEx, activeStreak: 0 })
        }
      } catch {
        // Non-critical: app continues with server-rendered initial data
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [userId, setIsCoach, setStats, setUser, setWorkouts])
}
