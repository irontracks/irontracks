/**
 * Hook that handles finishing an active workout.
 *
 * Flow:
 *  1. Confirm dialog ("Deseja finalizar?")
 *  2. Post-workout check-in (RPE, satisfaction)
 *  3. Build payload via buildFinishWorkoutPayload
 *  4. Safety-net backup to localStorage
 *  5. POST /api/workouts/finish (online) or queueFinishWorkout (offline)
 *  6. Clear backup on success
 *  7. onFinish(sessionForReport, showReport) → shows report view
 *
 * Changes from original:
 *  - REMOVED "Treino curto (< 30 min)" confirm → always saves
 *  - REMOVED "Gerar relatório?" confirm → always shows report
 */
import type { UnknownRecord, WorkoutSession } from '../types'
import { isObject } from '../utils'
import { queueFinishWorkout, isOnline } from '@/lib/offline/offlineSync'
import { buildFinishWorkoutPayload } from '@/lib/finishWorkoutPayload'
import { saveFinishBackup, clearFinishBackup } from '@/lib/workoutSafetyNet'
import { logWarn } from '@/lib/logger'

interface UseWorkoutFinishProps {
  session: WorkoutSession | null
  workout: UnknownRecord | null
  exercises: unknown[]
  logs: Record<string, unknown>
  ui: UnknownRecord
  userId?: string | null
  settings: Record<string, unknown> | null
  ticker: number
  postCheckinOpen: boolean
  setPostCheckinOpen: (v: boolean) => void
  postCheckinDraft: Record<string, string>
  setPostCheckinDraft: (v: Record<string, string>) => void
  postCheckinResolveRef: React.MutableRefObject<((v: unknown) => void) | null>
  persistDeloadHistoryFromSession: () => void
  finishing: boolean
  setFinishing: (v: boolean) => void
  alert: (msg: string, title?: string) => Promise<void>
  confirm: (msg: string, title?: string, opts?: Record<string, unknown>) => Promise<boolean>
  onFinish?: (session: unknown, showReport: boolean) => void
}

function parseStartedAtMs(raw: unknown): number {
  if (raw == null) return 0
  if (typeof raw === 'number' && raw > 0) return raw
  if (raw instanceof Date) return raw.getTime()
  const str = String(raw || '').trim()
  if (!str) return 0
  const n = Number(str)
  if (Number.isFinite(n) && n > 1_000_000_000) return n > 1e12 ? n : n * 1000
  const d = Date.parse(str)
  return Number.isFinite(d) ? d : 0
}

export function useWorkoutFinish(props: UseWorkoutFinishProps) {
  const {
    session, workout, exercises, logs, ui, userId, settings, ticker,
    postCheckinOpen, setPostCheckinOpen, postCheckinDraft, setPostCheckinDraft,
    postCheckinResolveRef, persistDeloadHistoryFromSession,
    finishing, setFinishing,
    alert, confirm, onFinish,
  } = props

  const requestPostWorkoutCheckin = async (): Promise<unknown | null> => {
    if (postCheckinOpen) return null
    return await new Promise<unknown | null>((resolve) => {
      postCheckinResolveRef.current = (value: unknown) => {
        resolve(value ?? null)
      }
      setPostCheckinDraft({ rpe: '', satisfaction: '', soreness: '', notes: '' })
      setPostCheckinOpen(true)
    })
  }

  const finishWorkout = async () => {
    if (!session || !workout) return
    if (finishing) return

    const startedAtMs = parseStartedAtMs(session?.startedAt)
    const elapsedSeconds = startedAtMs > 0 ? Math.max(0, Math.floor((ticker - startedAtMs) / 1000)) : 0

    // Always show report (removed "Gerar relatório?" dialog per user request)
    const showReport = true

    // Confirm finish
    let ok = false
    try {
      ok =
        typeof confirm === 'function'
          ? await confirm('Deseja finalizar o treino?', 'Finalizar treino', {
            confirmText: 'Sim',
            cancelText: 'Não',
          })
          : false
    } catch {
      ok = false
    }
    if (!ok) return

    // Always save to history (removed "Treino curto" dialog per user request)
    const shouldSaveHistory = true

    // Post-workout check-in
    let postCheckin = null
    if (shouldSaveHistory) {
      try {
        const prompt = settings ? settings.promptPostWorkoutCheckin !== false : true
        if (prompt) postCheckin = await requestPostWorkoutCheckin()
      } catch {
        postCheckin = null
      }
    }

    setFinishing(true)
    try {
      persistDeloadHistoryFromSession()
      const safePostCheckin = postCheckin && typeof postCheckin === 'object' ? (postCheckin as Record<string, unknown>) : null
      const payload = buildFinishWorkoutPayload({ workout, elapsedSeconds, logs, ui, postCheckin: safePostCheckin })

      let savedId = null
      if (shouldSaveHistory) {
        const idempotencyKey = `finish_${workout?.id || 'unknown'}_${Date.now()}_${Math.random().toString(36).slice(2)}`
        const submission = { session: payload, idempotencyKey }

        // ── SAFETY NET: backup BEFORE any save attempt ──
        const safeUserId = String(userId || '').trim()
        if (safeUserId) {
          saveFinishBackup(safeUserId, submission)
        }

        try {
          let onlineSuccess = false
          let offlineQueued = false

          if (isOnline()) {
            try {
              const resp = await fetch('/api/workouts/finish', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(submission),
              })

              if (resp.ok) {
                const json = await resp.json()
                savedId = json?.saved?.id ?? null
                onlineSuccess = true
              } else {
                if (resp.status >= 400 && resp.status < 500) {
                  const errText = await resp.text()
                  throw new Error(`Erro de validação: ${errText}`)
                }
                throw new Error(`Erro do servidor: ${resp.status}`)
              }
            } catch (fetchErr: unknown) {
              if (String(fetchErr).includes('Erro de validação')) throw fetchErr
              logWarn('useWorkoutFinish', 'Online save failed, attempting offline queue', fetchErr)
            }
          }

          if (!onlineSuccess) {
            try {
              await queueFinishWorkout(submission)
              offlineQueued = true
              await alert('Sem conexão estável. Treino salvo na fila e será sincronizado automaticamente.', 'Salvo Offline')
              savedId = 'offline-pending'
            } catch (queueErr) {
              logWarn('useWorkoutFinish', 'IDB queue also failed', queueErr)
              // Both failed — but localStorage backup survives
              await alert(
                'Não foi possível salvar online nem na fila offline. O treino foi salvo localmente e será recuperado na próxima vez que abrir o app.',
                '⚠️ Salvo Localmente'
              )
              savedId = 'local-backup'
            }
          }

          // ── SAFETY NET: clear backup only after confirmed save ──
          if (safeUserId && (onlineSuccess || offlineQueued)) {
            clearFinishBackup(safeUserId)
          }

        } catch (e: unknown) {
          const msg = isObject(e) && typeof e.message === 'string' ? e.message : String(e)
          if (msg.includes('Erro de validação')) {
            // Validation errors are terminal — clear backup since retries won't help
            const safeUid = String(userId || '').trim()
            if (safeUid) clearFinishBackup(safeUid)
            await alert(msg)
            setFinishing(false)
            return
          }
          await alert('CRÍTICO: Erro ao salvar treino: ' + (msg || 'erro inesperado'))
          setFinishing(false)
          return
        }
      }

      const sessionForReport = {
        ...payload,
        id: savedId,
      }

      try {
        if (typeof props?.onFinish === 'function') {
          props.onFinish(sessionForReport, showReport)
        }
      } catch { /* swallow */ }
    } catch (e: unknown) {
      const msg = isObject(e) && typeof e.message === 'string' ? e.message : String(e)
      await alert('Erro ao finalizar: ' + (msg || 'erro inesperado'))
    } finally {
      setFinishing(false)
    }
  }

  return {
    finishWorkout,
    requestPostWorkoutCheckin,
  }
}
