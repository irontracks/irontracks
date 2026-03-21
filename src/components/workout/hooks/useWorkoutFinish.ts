/**
 * Hook that handles finishing an active workout.
 *
 * IMPORTANT: This hook does NOT persist the workout to the database.
 * Persistence is handled by the WorkoutReport component which calls
 * POST /api/workouts/finish after the user sees the report.
 *
 * Flow:
 *  1. Build sessionData with exercise logs, durations, etc.
 *  2. Call onFinish(sessionData, true) → handleFinishSession
 *  3. handleFinishSession sets reportData and switches view to 'report'
 *  4. WorkoutReport calls /api/workouts/finish to persist
 *
 * Key design decisions:
 *  - The report is ALWAYS generated automatically (no confirm dialog).
 *  - Short workouts (< 30 min) are ALWAYS saved (no confirm dialog).
 *  - Post-workout check-in is prompted after confirmation.
 */
import { useCallback, useRef } from 'react'
import { createClient } from '@/utils/supabase/client'
import { logWarn } from '@/lib/logger'

interface UseWorkoutFinishOptions {
  session: unknown
  workout: unknown
  exercises: Array<Record<string, unknown>>
  logs: Record<string, unknown>
  ui: Record<string, unknown>
  userId: string
  settings: unknown
  ticker: number
  postCheckinOpen: boolean
  setPostCheckinOpen: (v: boolean) => void
  postCheckinDraft: Record<string, string>
  setPostCheckinDraft: (v: Record<string, string>) => void
  postCheckinResolveRef: React.MutableRefObject<((v: unknown) => void) | null>
  persistDeloadHistoryFromSession: (session: unknown) => void
  finishing: boolean
  setFinishing: (v: boolean) => void
  alert: (msg: string, title?: string) => Promise<void>
  confirm: (msg: string, title?: string) => Promise<boolean>
  onFinish?: (session: unknown, showReport: boolean) => void
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

export function useWorkoutFinish({
  session,
  workout,
  exercises,
  logs,
  ui,
  userId,
  settings,
  ticker,
  setPostCheckinOpen,
  setPostCheckinDraft,
  postCheckinResolveRef,
  persistDeloadHistoryFromSession,
  finishing,
  setFinishing,
  alert,
  confirm,
  onFinish,
}: UseWorkoutFinishOptions) {
  const finishingRef = useRef(false)

  /**
   * Request a post-workout check-in (RPE, satisfaction, etc).
   * Returns the user's answers via a promise resolved when the modal closes.
   */
  const requestPostWorkoutCheckin = useCallback((): Promise<Record<string, string> | null> => {
    return new Promise((resolve) => {
      postCheckinResolveRef.current = resolve as (v: unknown) => void
      setPostCheckinDraft({ rpe: '', satisfaction: '', soreness: '', notes: '' })
      setPostCheckinOpen(true)
    })
  }, [postCheckinResolveRef, setPostCheckinDraft, setPostCheckinOpen])

  /**
   * Finish the workout.
   *  - Always shows the report (no "Gerar relatório?" dialog).
   *  - Short workouts always saved (no "Treino curto" dialog).
   *  - Only asks confirmation when zero sets are completed.
   */
  const finishWorkout = useCallback(async () => {
    if (finishingRef.current || finishing) return
    finishingRef.current = true
    setFinishing(true)

    try {
      const sess = isObject(session) ? session : {} as Record<string, unknown>
      const wk = isObject(workout) ? workout : {} as Record<string, unknown>

      // Parse startedAt - it can be a number (epoch ms), ISO string, or missing
      let startedAtMs = 0
      const rawStarted = sess.startedAt
      if (typeof rawStarted === 'number' && rawStarted > 0) {
        startedAtMs = rawStarted
      } else if (typeof rawStarted === 'string') {
        const parsed = new Date(rawStarted).getTime()
        if (Number.isFinite(parsed) && parsed > 0) startedAtMs = parsed
      }

      const endedAt = Date.now()
      const durationMs = startedAtMs > 0 ? endedAt - startedAtMs : 0

      // Count completed sets
      let completedSets = 0
      let totalSets = 0
      exercises.forEach((ex, exIdx) => {
        const setsHeader = Math.max(0, parseInt(String(ex?.sets ?? '0'), 10) || 0)
        const sdArr = Array.isArray(ex?.setDetails) ? ex.setDetails : Array.isArray(ex?.set_details) ? ex.set_details as unknown[] : []
        const count = Math.max(setsHeader, Array.isArray(sdArr) ? sdArr.length : 0)
        totalSets += count
        for (let i = 0; i < count; i++) {
          const log = (logs as Record<string, Record<string, unknown>>)?.[`${exIdx}-${i}`]
          if (log?.done) completedSets++
        }
      })

      // Only confirm if absolutely zero sets were completed
      if (completedSets === 0) {
        const proceed = await confirm(
          'Nenhuma série foi marcada como feita. Deseja finalizar mesmo assim?',
          'Finalizar treino'
        )
        if (!proceed) {
          finishingRef.current = false
          setFinishing(false)
          return
        }
      }

      // Persist deload history (local storage)
      try {
        persistDeloadHistoryFromSession(session)
      } catch (e) { logWarn('useWorkoutFinish', 'deload history error', e) }

      // Request post-workout check-in
      let postCheckin: Record<string, string> | null = null
      try {
        postCheckin = await requestPostWorkoutCheckin()
        // Save post check-in to Supabase
        if (postCheckin && userId) {
          const supabase = createClient()
          const rpe = Number(postCheckin.rpe)
          const satisfaction = Number(postCheckin.satisfaction)
          const soreness = Number(postCheckin.soreness)
          supabase.from('workout_checkins').insert({
            user_id: userId,
            kind: 'post',
            planned_workout_id: String(wk.id || '').trim() || null,
            energy: null,
            soreness: Number.isFinite(soreness) && soreness >= 0 && soreness <= 10 ? Math.round(soreness) : null,
            notes: String(postCheckin.notes || '').trim() || null,
            answers: {
              rpe: Number.isFinite(rpe) && rpe >= 1 && rpe <= 10 ? Math.round(rpe) : null,
              satisfaction: Number.isFinite(satisfaction) && satisfaction >= 1 && satisfaction <= 5 ? Math.round(satisfaction) : null,
            },
          }).then(() => { /* fire and forget */ }).catch((e) => logWarn('useWorkoutFinish', 'post-checkin save error', e))
        }
      } catch (e) { logWarn('useWorkoutFinish', 'post-checkin error', e) }

      // Build the session data that will be passed to the report.
      // The report component + /api/workouts/finish handle the actual persistence.
      const workoutTitle = String(wk.title || wk.name || 'Treino').trim()
      const sessionData = {
        ...sess,
        workout: { ...wk, exercises },
        workoutTitle,
        workout_title: workoutTitle,
        logs,
        ui,
        exercises,
        date: startedAtMs > 0 ? new Date(startedAtMs).toISOString() : new Date().toISOString(),
        endedAt,
        startedAt: startedAtMs > 0 ? startedAtMs : endedAt,
        duration: durationMs,
        durationSeconds: Math.round(durationMs / 1000),
        durationMinutes: Math.round(durationMs / 60000),
        completedSets,
        totalSets,
        postCheckin,
        // Idempotency key to prevent duplicate saves
        finishIdempotencyKey: `finish-${userId}-${startedAtMs || endedAt}-${Date.now()}`,
      }

      // Always show report (showReport = true)
      // This triggers handleFinishSession → setReportData → setView('report')
      // The report component then calls POST /api/workouts/finish to persist
      onFinish?.(sessionData, true)
    } catch (e) {
      logWarn('useWorkoutFinish', 'finish error', e)
      await alert('Erro ao finalizar treino. Tente novamente.', 'Erro')
      finishingRef.current = false
      setFinishing(false)
    }
    // Note: we do NOT reset finishing/finishingRef here because the view
    // transitions to 'report'. The state cleanup happens when the session
    // is cleared by handleFinishSession (useWorkoutCrud).
  }, [
    session, workout, exercises, logs, ui, userId,
    finishing, setFinishing,
    persistDeloadHistoryFromSession,
    requestPostWorkoutCheckin,
    confirm, alert, onFinish,
  ])

  return { finishWorkout, requestPostWorkoutCheckin }
}
