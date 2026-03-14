/**
 * @module usePreviousSessionData
 *
 * Fetches the user's previous workout session for the same routine and
 * historical best estimated 1RM for each exercise. Used to display
 * comparison data (e.g. "last time you did 80kg × 10") during an
 * active workout session.
 *
 * @param session - The current active session to look up history for
 * @returns `{ previousData, bestE1rm, loading }`
 */
'use client'
import { useState, useEffect, useRef } from 'react'
import { getReportPreviousData, getHistoricalBestE1rm } from '@/actions/workout-actions'

type AnyObj = Record<string, unknown>

interface UsePreviousSessionDataParams {
  session: AnyObj | null
  previousSession?: AnyObj | null
  targetUserId: string | null
}

interface UsePreviousSessionDataReturn {
  /** The resolved previous session (from DB). Use `previousSession` prop first, fall back to this. */
  resolvedPreviousSession: AnyObj | null
  prevByExercise: {
    logsByExercise: Record<string, unknown>
    baseMsByExercise: Record<string, unknown>
  }
  historicalBestE1rm: Record<string, number>
}

/**
 * Fetches previous session data and historical best e1RM per exercise.
 *
 * Two sequential async operations:
 * 1. `getReportPreviousData` — resolves the closest previous session + per-exercise logs
 * 2. `getHistoricalBestE1rm`  — fetches all-time best estimated 1RM per exercise
 *
 * Both calls use ref guards to avoid re-fetching on re-renders.
 */
export const usePreviousSessionData = ({
  session,
  previousSession,
  targetUserId,
}: UsePreviousSessionDataParams): UsePreviousSessionDataReturn => {
  const [resolvedPreviousSession, setResolvedPreviousSession] = useState<AnyObj | null>(null)
  const [prevByExercise, setPrevByExercise] = useState<{
    logsByExercise: Record<string, unknown>
    baseMsByExercise: Record<string, unknown>
  }>({ logsByExercise: {}, baseMsByExercise: {} })
  const [historicalBestE1rm, setHistoricalBestE1rm] = useState<Record<string, number>>({})

  const fetchRef = useRef(false)

  // ── Single effect: parallel fetch of previous session + historical best e1RM ──
  useEffect(() => {
    let cancelled = false
    if (!targetUserId || !session || typeof session !== 'object') return
    if (fetchRef.current) return
    if (previousSession) setResolvedPreviousSession(null)

    const exercisesArr = Array.isArray(session?.exercises) ? (session.exercises as unknown[]) : []
    const exerciseNames = exercisesArr
      .map((ex: unknown) => String((ex as AnyObj)?.name || '').trim())
      .filter(Boolean)

    fetchRef.current = true
    ;(async () => {
      try {
        // Fire both requests in parallel for faster loading
        const [prevResult, histResult] = await Promise.allSettled([
          getReportPreviousData({
            userId: targetUserId,
            currentSessionId: typeof session?.id === 'string' && session.id ? session.id : null,
            currentDate: session?.date ? String(session.date) : null,
            currentOriginId: session?.originWorkoutId ? String(session.originWorkoutId) : null,
            currentTitle: session?.workoutTitle ? String(session.workoutTitle) : null,
            exerciseNames,
          }),
          exerciseNames.length > 0
            ? getHistoricalBestE1rm({
                userId: targetUserId,
                currentSessionId: typeof session?.id === 'string' && session.id ? session.id : null,
                exerciseNames,
              })
            : Promise.resolve({} as Record<string, number>),
        ])

        if (cancelled) return

        // Apply previous session data
        if (prevResult.status === 'fulfilled') {
          const result = prevResult.value
          if (!previousSession && result.previousSession) setResolvedPreviousSession(result.previousSession)
          setPrevByExercise({
            logsByExercise: result.prevLogsByExercise,
            baseMsByExercise: result.prevBaseMsByExercise,
          })
        } else {
          setPrevByExercise({ logsByExercise: {}, baseMsByExercise: {} })
        }

        // Apply historical best e1RM
        if (histResult.status === 'fulfilled') {
          setHistoricalBestE1rm(histResult.value)
        }
      } finally {
        fetchRef.current = false
      }
    })()

    return () => { cancelled = true }
  }, [session, previousSession, targetUserId])

  return { resolvedPreviousSession, prevByExercise, historicalBestE1rm }
}

