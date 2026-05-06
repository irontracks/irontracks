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

import { useEffect, useRef } from 'react'
import {
  useWatchBridge,
  type WatchDashboard,
  type WatchGym,
  type WatchSetLog,
  type WatchCardioSummary,
} from '@/hooks/useWatchBridge'
import { logWarn, logInfo } from '@/lib/logger'
import { useToast } from '@/contexts/ToastContext'

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
  const toastCtx = useTryToast()

  // Refs estáveis pra callbacks
  const onRefreshRef = useRef(onRefresh)
  useEffect(() => { onRefreshRef.current = onRefresh }, [onRefresh])
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

  // Push dashboard quando mudar
  useEffect(() => {
    if (!watch.isPaired || !watch.isWatchAppInstalled || !dashboard) return
    watch.pushDashboard(dashboard).catch(() => {})
  }, [
    watch.isPaired,
    watch.isWatchAppInstalled,
    dashboard,
    watch,
  ])

  // Push academias próximas
  useEffect(() => {
    if (!watch.isPaired || !watch.isWatchAppInstalled || !nearestGyms) return
    watch.pushNearestGyms(nearestGyms).catch(() => {})
  }, [
    watch.isPaired,
    watch.isWatchAppInstalled,
    nearestGyms,
    watch,
  ])

  return null
}

// ─── Helpers ───────────────────────────────────────────────────────────────

// Lê o ToastContext de forma defensiva — se o provider não está acima na
// árvore por algum motivo, vira no-op em vez de crashar.
function useTryToast(): ((msg: string, kind?: 'success' | 'error' | 'info') => void) | null {
  try {
    const ctx = useToast()
    return (msg: string, kind: 'success' | 'error' | 'info' = 'info') => {
      ctx.toast(msg, kind)
    }
  } catch {
    return null
  }
}
