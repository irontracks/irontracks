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
import { endAllRestLiveActivities, triggerHaptic, requestNativeReview } from '@/utils/native/irontracksNative'
import { apiAi } from '@/lib/api/ai'
import * as Sentry from '@sentry/nextjs'
import { playFinishSound } from '@/lib/sounds'

interface UseWorkoutFinishProps {
  session: WorkoutSession | null
  workout: UnknownRecord | null
  exercises: unknown[]
  logs: Record<string, unknown>
  ui: UnknownRecord
  userId?: string | null
  settings: Record<string, unknown> | null
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
    session, workout, exercises: _exercises, logs, ui, userId, settings,
    postCheckinOpen, setPostCheckinOpen, postCheckinDraft: _postCheckinDraft, setPostCheckinDraft,
    postCheckinResolveRef, persistDeloadHistoryFromSession,
    finishing, setFinishing,
    alert, confirm, onFinish: _onFinish,
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
    // Tempo total: guarda contra relógio que voltou atrás (negativo → 0) e limita a
    // 4h. App esquecido aberto (ou morto e restaurado horas depois) não vira mais um
    // treino de "6h" no histórico. (A subtração exata da pausa depende do timer e fica
    // pra um passo futuro; o teto já mata a pior distorção.)
    const MAX_WORKOUT_SECONDS = 4 * 60 * 60
    let elapsedSeconds = startedAtMs > 0 ? Math.floor((Date.now() - startedAtMs) / 1000) : 0
    if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) elapsedSeconds = 0
    if (elapsedSeconds > MAX_WORKOUT_SECONDS) elapsedSeconds = MAX_WORKOUT_SECONDS

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

    // Haptic: triumphant pattern on workout finish
    try { navigator?.vibrate?.([30, 50, 80, 50, 120]) } catch { /* not supported */ }

    setFinishing(true)
    try {
      persistDeloadHistoryFromSession()
      const safePostCheckin = postCheckin && typeof postCheckin === 'object' ? (postCheckin as Record<string, unknown>) : null
      const payload = buildFinishWorkoutPayload({ workout, elapsedSeconds, logs, ui, postCheckin: safePostCheckin })

      let savedId = null
      if (shouldSaveHistory) {
        // Chave anti-duplicata ESTÁVEL: derivada de workout + horário de início.
        // Qualquer nova tentativa de finalizar o MESMO treino (rede caiu após salvar,
        // app morreu e foi restaurado, dois dispositivos) gera a MESMA chave → o
        // servidor deduplica em vez de gravar dois treinos. (Antes usava hora+aleatório,
        // que mudava a cada tentativa e permitia duplicata.) Fallback único só quando
        // não há horário de início, pra não colar dois treinos distintos por engano.
        const finishAnchor = startedAtMs > 0 ? String(startedAtMs) : `${Date.now()}_${Math.random().toString(36).slice(2)}`
        const idempotencyKey = `finish_${workout?.id || 'unknown'}_${finishAnchor}`
        const submission = { session: payload, idempotencyKey }

        // ── SAFETY NET: backup BEFORE any save attempt ──
        const safeUserId = String(userId || '').trim()
        if (safeUserId) {
          saveFinishBackup(safeUserId, submission)
        }

        try {
          let onlineSuccess = false

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
              Sentry.captureException(fetchErr, { tags: { area: 'workout-finish', phase: 'online-save' } })
              logWarn('useWorkoutFinish', 'Online save failed, attempting offline queue', fetchErr)
            }
          }

          if (!onlineSuccess) {
            try {
              await queueFinishWorkout(submission)
              await alert('Sem conexão estável. Treino salvo na fila e será sincronizado automaticamente.', 'Salvo Offline')
              savedId = 'offline-pending'
            } catch (queueErr) {
              Sentry.captureException(queueErr, { tags: { area: 'workout-finish', phase: 'offline-queue' } })
              logWarn('useWorkoutFinish', 'IDB queue also failed', queueErr)
              // Both failed — but localStorage backup survives
              await alert(
                'Não foi possível salvar online nem na fila offline. O treino foi salvo localmente e será recuperado na próxima vez que abrir o app.',
                '⚠️ Salvo Localmente'
              )
              savedId = 'local-backup'
            }
          }

          // ── SAFETY NET: só limpa o backup com confirmação REAL do servidor.
          // Se foi apenas enfileirado offline, MANTÉM o backup: se o job da fila
          // falhar depois (token/validação), a recuperação ainda tem o treino. O
          // re-envio usa a MESMA idempotencyKey → o servidor deduplica (sem duplicata).
          // (A fila limpa o backup ao sincronizar com sucesso — ver lote offline.)
          if (safeUserId && onlineSuccess) {
            clearFinishBackup(safeUserId)
          }

          // Auto-atualiza o Mapa Muscular em background (recalcula + recacheia,
          // sem IA) pra refletir o treino recém-concluído — dispensa o botão
          // "Atualizar". Fire-and-forget: nunca bloqueia/quebra a finalização.
          if (onlineSuccess) {
            void apiAi.muscleMapWeek({ refreshCache: true, refreshAi: false }).catch(() => { })
          }

        } catch (e: unknown) {
          const msg = isObject(e) && typeof e.message === 'string' ? e.message : String(e)
          Sentry.captureException(e, { tags: { area: 'workout-finish', phase: msg.includes('Erro de validação') ? 'validation' : 'critical-save' } })
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

      // Som de fim de TREINO (distinto do beep de fim de descanso) — marca o
      // momento de conclusão. Gated na preferência de som; best-effort, nunca
      // bloqueia a finalização. (Antes playFinishSound existia mas nunca era tocado.)
      try {
        const soundsOn = settings ? settings.enableSounds !== false : true
        if (soundsOn) {
          const vol = Math.max(0, Math.min(1, Number(settings?.soundVolume ?? 100) / 100))
          playFinishSound({ enabled: true, volume: vol })
        }
      } catch { /* best effort */ }

      // Ensure any active rest timer Live Activity is cleared when workout ends
      endAllRestLiveActivities().catch(() => { })
      triggerHaptic('heavy').catch(() => { })

      // In-app review at milestone workouts (3rd, 10th, 30th).
      // SKStoreReviewController enforces a hard cap of 3 times/year — safe to call here.
      try {
        const reviewKey = 'irontracks.review.count.v1'
        const n = (parseInt(localStorage.getItem(reviewKey) ?? '0', 10) || 0) + 1
        localStorage.setItem(reviewKey, String(n))
        if (n === 3 || n === 10 || n === 30) {
          void requestNativeReview()
        }
      } catch { /* swallow — never block workout completion */ }

      try {
        if (typeof props?.onFinish === 'function') {
          props.onFinish(sessionForReport, showReport)
        }
      } catch { /* swallow */ }
    } catch (e: unknown) {
      const msg = isObject(e) && typeof e.message === 'string' ? e.message : String(e)
      Sentry.captureException(e, { tags: { area: 'workout-finish', phase: 'finalize' } })
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
