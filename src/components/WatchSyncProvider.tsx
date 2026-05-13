'use client'

/**
 * WatchSyncProvider
 *
 * Componente "headless" que monta perto da raiz da árvore (idealmente dentro
 * do AppShell autenticado) e mantém o Apple Watch sincronizado:
 *
 *   1. Empurra dashboard / treino do dia / academias próximas pro Watch
 *      sempre que esses dados mudam no app.
 *   2. Reage aos eventos vindos do Watch:
 *        • série registrada       → posta no /api/workouts/log-set (ou queue)
 *        • cardio terminado       → posta no /api/cardio/save
 *        • refresh requested      → forçar revalidação (callback opcional)
 *        • checkin requested      → posta no /api/gps/qr-checkin
 *
 * Não renderiza nada — apenas roda useEffects.
 *
 * Uso:
 *   <WatchSyncProvider
 *     dashboard={dashboardData}
 *     nearestGyms={gyms}
 *     onRefresh={() => mutate()}
 *   />
 */

import { useContext, useEffect, useRef } from 'react'
import {
  useWatchBridge,
  type WatchDashboard,
  type WatchGym,
  type WatchSetLog,
  type WatchCardioSummary,
} from '@/hooks/useWatchBridge'
import { logWarn, logInfo } from '@/lib/logger'
import { ToastContext } from '@/contexts/ToastContext'

interface Props {
  /** Estado do dashboard a ser empurrado pro Watch. Pode ser null/undefined enquanto carrega. */
  dashboard?: WatchDashboard | null
  /** Lista de academias próximas (pra tela de check-in). */
  nearestGyms?: WatchGym[]
  /** Callback opcional para revalidar dados quando o Watch pedir refresh. */
  onRefresh?: () => void
  /** Callback opcional pra interceptar série registrada no Watch antes do POST. */
  onSetLogged?: (log: WatchSetLog) => void
  /** Callback opcional pra interceptar cardio terminado no Watch. */
  onCardioFinished?: (summary: WatchCardioSummary) => void
  /** Callback opcional pra customizar fluxo de check-in. Default: chama /api/gps/qr-checkin. */
  onCheckinRequested?: (gym: WatchGym) => Promise<void> | void
}

export default function WatchSyncProvider({
  dashboard,
  nearestGyms,
  onRefresh,
  onSetLogged,
  onCardioFinished,
  onCheckinRequested,
}: Props) {
  // Lê o ToastContext direto via useContext (null-safe: retorna null se sem provider).
  // NÃO usa useToast() porque ele lança — try/catch em volta de hook viola Rules of Hooks.
  const toastCtxRaw = useContext(ToastContext)
  const toastCtx: ((msg: string, kind?: 'success' | 'error' | 'info') => void) | null =
    toastCtxRaw ? (msg, kind = 'info') => toastCtxRaw.toast(msg, kind) : null

  // Refs estáveis pra callbacks
  const onRefreshRef = useRef(onRefresh)
  useEffect(() => { onRefreshRef.current = onRefresh }, [onRefresh])
  // Ref do dashboard atual — usada pra responder com snapshot imediato quando
  // o Watch pede refresh (não esperar o fetch async terminar).
  const dashboardRef = useRef(dashboard)
  useEffect(() => { dashboardRef.current = dashboard }, [dashboard])
  const onSetLoggedRef = useRef(onSetLogged)
  useEffect(() => { onSetLoggedRef.current = onSetLogged }, [onSetLogged])
  const onCardioFinishedRef = useRef(onCardioFinished)
  useEffect(() => { onCardioFinishedRef.current = onCardioFinished }, [onCardioFinished])
  const onCheckinRequestedRef = useRef(onCheckinRequested)
  useEffect(() => { onCheckinRequestedRef.current = onCheckinRequested }, [onCheckinRequested])

  const watch = useWatchBridge({
    onSetLogged: async (log) => {
      logInfo('WatchSync', 'série recebida do Watch:', log)
      try {
        if (onSetLoggedRef.current) {
          onSetLoggedRef.current(log)
        } else {
          // Default: posta no endpoint padrão do app
          await fetch('/api/workouts/log-set-from-watch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(log),
          }).catch(() => null)
        }
      } catch (e) {
        logWarn('WatchSync', 'log-set falhou:', e)
      }
    },
    onCardioFinished: async (summary) => {
      logInfo('WatchSync', 'cardio recebido do Watch:', summary)
      try {
        if (onCardioFinishedRef.current) {
          onCardioFinishedRef.current(summary)
        } else {
          await fetch('/api/gps/cardio/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              source: 'apple-watch',
              distance_meters: summary.distanceMeters,
              duration_seconds: summary.durationSeconds,
              avg_heart_rate: summary.avgHeartRate ?? null,
              max_heart_rate: summary.maxHeartRate ?? null,
              calories: summary.caloriesEstimated,
              avg_pace_min_km: summary.avgPaceMinKm ?? null,
              started_at: summary.startedAt,
              finished_at: summary.finishedAt,
            }),
          }).catch(() => null)
          toastCtx?.('Cardio do Watch salvo!', 'success' as const)
        }
      } catch (e) {
        logWarn('WatchSync', 'cardio-save falhou:', e)
      }
    },
    onRefreshRequested: () => {
      // 1) Reenvia o snapshot atual imediatamente — cobre o caso de Watch frio
      //    ou applicationContext desatualizado depois de o usuário iniciar treino.
      const snapshot = dashboardRef.current
      if (snapshot) {
        watch.pushDashboard(snapshot).catch(() => {})
      }
      // 2) Dispara também o refresh remoto pra trazer dados frescos.
      onRefreshRef.current?.()
    },
    onCheckinRequested: async (gym) => {
      logInfo('WatchSync', 'check-in pedido do Watch:', gym)
      try {
        if (onCheckinRequestedRef.current) {
          await onCheckinRequestedRef.current(gym)
        } else {
          await fetch('/api/gps/qr-checkin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              source: 'apple-watch',
              gym_id: gym.id,
              latitude: gym.latitude,
              longitude: gym.longitude,
            }),
          }).catch(() => null)
          toastCtx?.(`Check-in em ${gym.name}`, 'success' as const)
        }
      } catch (e) {
        logWarn('WatchSync', 'check-in falhou:', e)
      }
    },
  })

  // Refs estáveis pras funções de push do bridge — evita re-disparo do effect a
  // cada render, já que `useWatchBridge` retornava objeto não-memoizado.
  const pushDashboardRef = useRef(watch.pushDashboard)
  const pushNearestGymsRef = useRef(watch.pushNearestGyms)
  useEffect(() => { pushDashboardRef.current = watch.pushDashboard }, [watch.pushDashboard])
  useEffect(() => { pushNearestGymsRef.current = watch.pushNearestGyms }, [watch.pushNearestGyms])

  // Push dashboard quando mudar — deps primitivas só.
  useEffect(() => {
    if (!watch.isPaired || !watch.isWatchAppInstalled || !dashboard) return
    pushDashboardRef.current(dashboard).catch(() => {})
  }, [watch.isPaired, watch.isWatchAppInstalled, dashboard])

  // Push academias próximas — idem.
  useEffect(() => {
    if (!watch.isPaired || !watch.isWatchAppInstalled || !nearestGyms) return
    pushNearestGymsRef.current(nearestGyms).catch(() => {})
  }, [watch.isPaired, watch.isWatchAppInstalled, nearestGyms])

  return null
}
