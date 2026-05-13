'use client'

/**
 * useWatchBridge — ponte React entre o app web (Capacitor) e o Apple Watch.
 *
 * Responsabilidades:
 *   1. Lê o estado de pareamento do Watch (isPaired, isReachable, etc)
 *   2. Sincroniza dashboard / próximo treino / academias próximas → Watch
 *      (useEffect dispara sempre que dependências mudam)
 *   3. Escuta eventos do Watch:
 *        - watchSetLogged       → registra série offline-safe via callback
 *        - watchCardioFinished  → salva sessão de cardio
 *        - watchRefreshRequested → re-puxa dados frescos do servidor
 *        - watchCheckinRequested → executa check-in via API
 *
 * O Watch não fala com Supabase direto — todas as escritas passam pelo iPhone.
 * Isso simplifica auth (Watch não carrega tokens) e mantém uma única fonte
 * da verdade.
 */

import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import {
  watchGetState,
  watchSendDashboard,
  watchSendWorkout,
  watchSendNearestGyms,
  onWatchSetLogged,
  onWatchCardioFinished,
  onWatchRefreshRequested,
  onWatchCheckinRequested,
  onWatchReachabilityChanged,
  type WatchState,
} from '@/utils/native/irontracksNative'
import { logWarn } from '@/lib/logger'

// ─── Modelos compartilhados (espelham os do Watch app) ─────────────────────

export interface WatchExercise {
  id: string
  name: string
  sets: number
  reps: string
  restSeconds: number
  weightSuggestion?: string | null
  muscleGroup?: string | null
  notes?: string | null
}

export interface WatchWorkout {
  id: string
  name: string
  dayLabel: string
  estimatedMinutes: number
  exercises: WatchExercise[]
  scheduledAt?: string | null
}

export interface WatchDashboard {
  streakDays: number
  weekWorkouts: number
  weekGoal: number
  nextWorkout: WatchWorkout | null
  userName: string
  /** true quando o iPhone está executando um treino. Garante que o Watch mostre estado correto. */
  isWorkoutActive: boolean
  /** id do treino atualmente em andamento (se houver) — espelha activeSession.workout.id. */
  activeWorkoutId: string | null
  /** true se o usuário tem entitlement VIP ativo (RevenueCat). Watch usa pra gate de features. */
  isVip: boolean
}

export interface WatchGym {
  id: string
  name: string
  latitude: number
  longitude: number
  radiusMeters: number
}

export interface WatchSetLog {
  id: string
  exerciseId: string
  setNumber: number
  reps: number
  weightKg?: number | null
  rpe?: number | null
  completedAt: string
}

export interface WatchCardioSummary {
  distanceMeters: number
  durationSeconds: number
  avgHeartRate?: number | null
  maxHeartRate?: number | null
  caloriesEstimated: number
  avgPaceMinKm?: number | null
  startedAt: string
  finishedAt: string
}

// ─── Hook ────────────────────────────────────────────────────────────────

export interface UseWatchBridgeOptions {
  /** Disparado quando o Watch registra uma série. */
  onSetLogged?: (log: WatchSetLog) => void
  /** Disparado quando o Watch termina um cardio. */
  onCardioFinished?: (summary: WatchCardioSummary) => void
  /** Disparado quando o Watch pede dados atualizados. */
  onRefreshRequested?: () => void
  /** Disparado quando o Watch pede pra fazer check-in. */
  onCheckinRequested?: (gym: WatchGym) => void
}

export interface UseWatchBridgeResult extends WatchState {
  /** Empurra o estado completo do dashboard pro Watch. */
  pushDashboard: (dashboard: WatchDashboard) => Promise<boolean>
  /** Empurra o treino do dia pro Watch (se quiser sobrescrever o do dashboard). */
  pushWorkout: (workout: WatchWorkout) => Promise<boolean>
  /** Empurra a lista de academias próximas pro Watch. */
  pushNearestGyms: (gyms: WatchGym[]) => Promise<boolean>
  /** Recarrega o estado de pareamento. */
  refreshState: () => Promise<void>
}

export function useWatchBridge(opts: UseWatchBridgeOptions = {}): UseWatchBridgeResult {
  const [state, setState] = useState<WatchState>({
    isPaired: false,
    isReachable: false,
    isWatchAppInstalled: false,
    isSupported: false,
  })

  // Refs pra callbacks — evita re-subscrever a cada render
  const onSetLoggedRef = useRef(opts.onSetLogged)
  const onCardioFinishedRef = useRef(opts.onCardioFinished)
  const onRefreshRequestedRef = useRef(opts.onRefreshRequested)
  const onCheckinRequestedRef = useRef(opts.onCheckinRequested)

  useEffect(() => { onSetLoggedRef.current = opts.onSetLogged }, [opts.onSetLogged])
  useEffect(() => { onCardioFinishedRef.current = opts.onCardioFinished }, [opts.onCardioFinished])
  useEffect(() => { onRefreshRequestedRef.current = opts.onRefreshRequested }, [opts.onRefreshRequested])
  useEffect(() => { onCheckinRequestedRef.current = opts.onCheckinRequested }, [opts.onCheckinRequested])

  // ─── Sub: estado de pareamento ─────────────────────────────────────────

  const refreshState = useCallback(async () => {
    try {
      const s = await watchGetState()
      setState(s)
    } catch (e) {
      logWarn('useWatchBridge', 'watchGetState falhou:', e)
    }
  }, [])

  useEffect(() => {
    // refreshState() chama setState sincronamente — escapamos via microtask
    // pra evitar o aviso de "cascading renders" do react-hooks/set-state-in-effect.
    Promise.resolve().then(refreshState)
    const off = onWatchReachabilityChanged((s) => setState(s))
    return off
  }, [refreshState])

  // ─── Sub: eventos do Watch ─────────────────────────────────────────────

  useEffect(() => {
    const offSet = onWatchSetLogged((payload) => {
      try {
        if (!onSetLoggedRef.current) return
        const log = JSON.parse(payload) as WatchSetLog
        onSetLoggedRef.current(log)
      } catch (e) {
        logWarn('useWatchBridge', 'onSetLogged parse falhou:', e)
      }
    })
    const offCardio = onWatchCardioFinished((payload) => {
      try {
        if (!onCardioFinishedRef.current) return
        const summary = JSON.parse(payload) as WatchCardioSummary
        onCardioFinishedRef.current(summary)
      } catch (e) {
        logWarn('useWatchBridge', 'onCardioFinished parse falhou:', e)
      }
    })
    const offRefresh = onWatchRefreshRequested(() => {
      onRefreshRequestedRef.current?.()
    })
    const offCheckin = onWatchCheckinRequested((payload) => {
      try {
        if (!onCheckinRequestedRef.current) return
        const gym = JSON.parse(payload) as WatchGym
        onCheckinRequestedRef.current(gym)
      } catch (e) {
        logWarn('useWatchBridge', 'onCheckin parse falhou:', e)
      }
    })

    return () => {
      offSet()
      offCardio()
      offRefresh()
      offCheckin()
    }
  }, [])

  // ─── Sends ─────────────────────────────────────────────────────────────

  const pushDashboard = useCallback(async (dashboard: WatchDashboard): Promise<boolean> => {
    return await watchSendDashboard(dashboard)
  }, [])

  const pushWorkout = useCallback(async (workout: WatchWorkout): Promise<boolean> => {
    return await watchSendWorkout(workout)
  }, [])

  const pushNearestGyms = useCallback(async (gyms: WatchGym[]): Promise<boolean> => {
    return await watchSendNearestGyms(gyms)
  }, [])

  // Memoiza retorno pra estabilizar referência. Sem isso, todo consumer (ex:
  // WatchSyncProvider) que tenha `watch` nas deps de useEffect dispara o effect
  // a cada render do componente — em sessão ativa, isso causaria centenas de
  // chamadas/min ao bridge JS↔Swift via WatchConnectivity.
  return useMemo(() => ({
    ...state,
    pushDashboard,
    pushWorkout,
    pushNearestGyms,
    refreshState,
  }), [state, pushDashboard, pushWorkout, pushNearestGyms, refreshState])
}
