/**
 * Hook that handles finishing an active workout.
 *
 * Key design decisions:
 *  - The report is ALWAYS generated automatically (no confirm dialog).
 *  - Short workouts (< 30 min) are ALWAYS saved to history (no confirm dialog).
 *  - Post-workout check-in is still prompted so the user can track RPE/satisfaction.
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
   *  - Always saves the workout to history.
   *  - Always shows the report.
   *  - No "Gerar relatório?" or "Treino curto" prompts.
   */
  const finishWorkout = useCallback(async () => {
    if (finishingRef.current || finishing) return
    finishingRef.current = true
    setFinishing(true)

    try {
      const sess = isObject(session) ? session : {} as Record<string, unknown>
      const wk = isObject(workout) ? workout : {} as Record<string, unknown>
      const startedAt = typeof sess.startedAt === 'number' ? sess.startedAt : 0
      const endedAt = Date.now()
      const durationMs = startedAt > 0 ? endedAt - startedAt : 0

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

      // Confirm if no sets were done
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

      // Persist deload history
      try {
        persistDeloadHistoryFromSession(session)
      } catch (e) { logWarn('useWorkoutFinish', 'deload history error', e) }

      // Save session to Supabase
      try {
        if (userId) {
          const supabase = createClient()
          const { error } = await supabase.from('workout_sessions').insert({
            user_id: userId,
            workout_id: String(wk.id || '').trim() || null,
            workout_title: String(wk.title || wk.name || 'Treino').trim(),
            started_at: startedAt > 0 ? new Date(startedAt).toISOString() : new Date().toISOString(),
            ended_at: new Date(endedAt).toISOString(),
            duration_seconds: Math.round(durationMs / 1000),
            total_sets: totalSets,
            completed_sets: completedSets,
            exercises_data: exercises.map((ex, idx) => ({
              name: ex?.name || '',
              sets: ex?.sets || 0,
              method: ex?.method || 'Normal',
              logs: Object.fromEntries(
                Object.entries(logs).filter(([k]) => k.startsWith(`${idx}-`))
              ),
            })),
          })
          if (error) logWarn('useWorkoutFinish', 'session save error', error)
        }
      } catch (e) { logWarn('useWorkoutFinish', 'session save error', e) }

      // Request post-workout check-in
      let postCheckin: Record<string, string> | null = null
      try {
        postCheckin = await requestPostWorkoutCheckin()
        if (postCheckin && userId) {
          const supabase = createClient()
          const rpe = Number(postCheckin.rpe)
          const satisfaction = Number(postCheckin.satisfaction)
          const soreness = Number(postCheckin.soreness)
          await supabase.from('workout_checkins').insert({
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
          }).catch(() => { })
        }
      } catch (e) { logWarn('useWorkoutFinish', 'post-checkin error', e) }

      // Build session data for report
      const sessionData = {
        ...sess,
        workout: { ...wk, exercises },
        logs,
        ui,
        endedAt,
        duration: durationMs,
        durationSeconds: Math.round(durationMs / 1000),
        completedSets,
        totalSets,
        postCheckin,
      }

      // Always show report (showReport = true)
      onFinish?.(sessionData, true)
    } catch (e) {
      logWarn('useWorkoutFinish', 'finish error', e)
      await alert('Erro ao finalizar treino. Tente novamente.', 'Erro')
    } finally {
      finishingRef.current = false
      setFinishing(false)
    }
  }, [
    session, workout, exercises, logs, ui, userId,
    finishing, setFinishing,
    persistDeloadHistoryFromSession,
    requestPostWorkoutCheckin,
    confirm, alert, onFinish,
  ])

  return { finishWorkout, requestPostWorkoutCheckin }
}
