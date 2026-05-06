/**
 * useWorkoutLiveActivity
 *
 * Mirrors the active workout state into an iOS Live Activity (Dynamic Island
 * + Lock Screen). Runs only on iOS native — no-ops everywhere else.
 *
 *   • mount  → start activity with the current snapshot
 *   • change → throttled update (max 1 per 1 s) so per-keystroke set edits
 *              don't burn the ActivityKit budget (Apple limits ~120 updates/h)
 *   • unmount → end activity (covers both finish and cancel flows)
 *
 * The hook reads from already-extracted controller state — it does NOT pull
 * from contexts, so it can be invoked anywhere a workout view exists.
 */
'use client'

import { useEffect, useMemo, useRef } from 'react'
import {
  startWorkoutLiveActivity,
  updateWorkoutLiveActivity,
  endWorkoutLiveActivity,
} from '@/utils/native/irontracksNative'
import { isIosNative } from '@/utils/platform'

interface UseWorkoutLiveActivityArgs {
  /** Static title shown on the LA (e.g. "Treino A — Peito + Tríceps"). */
  workoutName: string
  /** Unix-ms when the user tapped "Iniciar Treino". 0 disables the hook. */
  workoutStartMs: number
  /** Workout exercises array (read for current exercise name + set count). */
  exercises: ReadonlyArray<Record<string, unknown>>
  /** Per-(exIdx, setIdx) logs map — keys are "<exIdx>_<setIdx>". */
  logs: Record<string, unknown>
  /** Index of the exercise the user is currently focused on. */
  currentExerciseIdx: number
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

/** Count of `setDetails`/`set_details` for a given exercise (fallback to `sets`). */
const setsCountFor = (ex: Record<string, unknown> | undefined): number => {
  if (!ex) return 0
  const sd = ex.setDetails ?? ex.set_details
  if (Array.isArray(sd)) return sd.length
  const n = Number(ex.sets)
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0
}

/** Parse a possibly-stringified number, returning 0 on failure. */
const num = (v: unknown): number => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  if (typeof v === 'string') {
    const n = Number(v.replace(',', '.').trim())
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

const MIN_UPDATE_INTERVAL_MS = 1000

export function useWorkoutLiveActivity({
  workoutName,
  workoutStartMs,
  exercises,
  logs,
  currentExerciseIdx,
}: UseWorkoutLiveActivityArgs): void {
  // ── Compute the current snapshot ──────────────────────────────────────────
  const snapshot = useMemo(() => {
    const safeIdx = Math.max(0, Math.min(currentExerciseIdx | 0, Math.max(exercises.length - 1, 0)))
    const ex = isObj(exercises[safeIdx]) ? (exercises[safeIdx] as Record<string, unknown>) : undefined
    const exerciseName = String(ex?.name ?? '').slice(0, 50)
    const totalSetsForExercise = setsCountFor(ex)

    let totalSetsCompleted = 0
    let totalVolumeKg = 0
    let lastDoneSetIdxInCurrent = -1

    for (const [key, raw] of Object.entries(logs)) {
      if (!isObj(raw)) continue
      const log = raw
      const done = log.done === true || log.completed === true
      if (!done) continue
      totalSetsCompleted += 1
      const w = num(log.weight)
      const r = num(log.reps)
      if (w > 0 && r > 0) totalVolumeKg += w * r

      // Track the highest done set index inside the focused exercise so we can
      // surface "Série N/total" where N = next un-done set (or last+1 if all done).
      // Log keys use the format "${exIdx}-${setIdx}" (dash separator, not underscore).
      const dashIdx = key.lastIndexOf('-')
      const exI = dashIdx > 0 ? Number(key.slice(0, dashIdx)) : NaN
      const setI = dashIdx > 0 ? Number(key.slice(dashIdx + 1)) : NaN
      if (Number.isFinite(exI) && Number.isFinite(setI) && exI === safeIdx && setI > lastDoneSetIdxInCurrent) {
        lastDoneSetIdxInCurrent = setI
      }
    }

    const currentSetIndex = Math.max(1, Math.min(totalSetsForExercise || 1, lastDoneSetIdxInCurrent + 2))

    return {
      currentExerciseName: exerciseName,
      currentSetIndex,
      totalSetsForExercise: Math.max(totalSetsForExercise, currentSetIndex),
      totalSetsCompleted,
      totalVolumeKg: Math.round(totalVolumeKg),
    }
  }, [exercises, logs, currentExerciseIdx])

  // ── Lifecycle: start on mount, end on unmount ─────────────────────────────
  const startedRef = useRef(false)
  const lastUpdateMsRef = useRef(0)
  const pendingUpdateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Start exactly once when we have a valid start time. The hook callsite
  // remounts when entering / leaving ActiveWorkout, so this is the right scope.
  useEffect(() => {
    if (!isIosNative()) return
    if (startedRef.current) return
    if (!Number.isFinite(workoutStartMs) || workoutStartMs <= 0) return
    startedRef.current = true
    void startWorkoutLiveActivity({
      workoutName,
      workoutStartMs,
      ...snapshot,
    })
    return () => {
      if (pendingUpdateTimerRef.current) {
        clearTimeout(pendingUpdateTimerRef.current)
        pendingUpdateTimerRef.current = null
      }
      void endWorkoutLiveActivity()
      startedRef.current = false
    }
    // We intentionally start with the FIRST snapshot — subsequent changes
    // flow through the dedicated update effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workoutStartMs])

  // ── Throttled updates: max 1 per second ───────────────────────────────────
  useEffect(() => {
    if (!isIosNative()) return
    if (!startedRef.current) return

    const now = Date.now()
    const elapsed = now - lastUpdateMsRef.current

    const flush = () => {
      lastUpdateMsRef.current = Date.now()
      pendingUpdateTimerRef.current = null
      void updateWorkoutLiveActivity(snapshot)
    }

    if (elapsed >= MIN_UPDATE_INTERVAL_MS) {
      flush()
    } else {
      // Coalesce: cancel any pending flush and schedule one at the next slot.
      if (pendingUpdateTimerRef.current) clearTimeout(pendingUpdateTimerRef.current)
      pendingUpdateTimerRef.current = setTimeout(flush, MIN_UPDATE_INTERVAL_MS - elapsed)
    }
  }, [snapshot])
}
