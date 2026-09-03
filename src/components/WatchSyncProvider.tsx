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
  buildCardioIdempotencyKey,
  type WatchDashboard,
  type WatchGym,
  type WatchSetLog,
  type WatchCardioSummary,
} from '@/hooks/useWatchBridge'
import { logWarn, logInfo } from '@/lib/logger'
import { ToastContext } from '@/contexts/ToastContext'
import { queueWatchCardioSave, queueWatchLogSet } from '@/lib/offline/offlineSync'

/**
 * Status HTTP que indicam falha TRANSITÓRIA (sessão do iPhone expirada, rede
 * instável, servidor fora do ar) — reenfileirar resolve sozinho no próximo
 * flush. `status === 0` cobre o `fetch` que nem completou (erro de rede: o
 * `.catch(() => null)` das chamadas abaixo devolve `res: null`).
 * Ver D-5/D-6 do relatório de auditoria do Watch (02/09/2026).
 */
export function isTransientStatus(status: number): boolean {
  return status === 0 || status === 401 || status === 408 || status === 429 || status >= 500
}

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
          return
        }

        // D-6: antes o resultado nunca era olhado — a rota devolve 404
        // `no_active_session` (treino iniciado só no relógio) ou
        // `exercise_not_found` (id do exercício não bate com o treino ativo)
        // em cenários reais, e a série sumia sem NENHUM aviso.
        const res = await fetch('/api/workouts/log-set-from-watch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(log),
        }).catch(() => null)

        if (res && res.ok) return

        const status = res?.status ?? 0
        if (isTransientStatus(status)) {
          // D-5: sessão expirada / rede caiu / servidor fora do ar — o Watch
          // já descartou a série da fila DELE ao entregar aqui, então sem
          // reenfileirar o dado morria de vez. `queueWatchLogSet` é
          // idempotente pelo `log.id` (não duplica se cair aqui de novo).
          await queueWatchLogSet(log as unknown as Record<string, unknown>)
          toastCtx?.('Série do Watch salva — será reenviada automaticamente.', 'info' as const)
          return
        }

        // Falha PERMANENTE (400/404): reenviar não conserta nada, então NÃO
        // enfileira — só avisa com a causa específica em vez de sumir calado.
        let reason = 'Não foi possível registrar a série do Watch.'
        try {
          const body = res ? await res.clone().json() : null
          if (body?.error === 'no_active_session') {
            reason = 'Nenhum treino ativo no iPhone — a série do Watch não foi registrada.'
          } else if (body?.error === 'exercise_not_found') {
            reason = 'Exercício do Watch não encontrado no treino ativo do iPhone.'
          } else if (body?.error === 'invalid_session_state') {
            reason = 'Sessão de treino corrompida no iPhone — reabra o treino.'
          }
        } catch { /* corpo sem JSON — mantém mensagem genérica */ }
        logWarn('WatchSync', `log-set falhou definitivamente: status=${status} — ${reason}`)
        toastCtx?.(reason, 'error' as const)
      } catch (e) {
        logWarn('WatchSync', 'log-set falhou:', e)
      }
    },
    onCardioFinished: async (summary) => {
      logInfo('WatchSync', 'cardio recebido do Watch:', summary)
      try {
        if (onCardioFinishedRef.current) {
          onCardioFinishedRef.current(summary)
          return
        }

        // Payload no shape do saveTrackSchema (senão 400): o campo é
        // `calories_estimated` (não `calories`).
        //
        // 02/09/2026: três dados que o relógio media e morriam aqui —
        // o ESPORTE (tudo virava "running", e uma pedalada entrava como
        // corrida), o TRAÇADO (ia `[]`, então a corrida do Watch não tinha
        // mapa) e a FREQUÊNCIA CARDÍACA (não havia coluna; agora há).
        //
        // D-2: `client_id` é a chave de idempotência determinística (mesmo
        // cardio → mesma chave, mesmo vindo por dois transportes do bridge
        // nativo). A rota (`/api/gps/cardio/save`) descarta duplicata por ela;
        // ver `buildCardioIdempotencyKey`.
        const payload = {
          activity_type: summary.activityType || 'running',
          distance_meters: summary.distanceMeters,
          duration_seconds: Math.round(summary.durationSeconds),
          calories_estimated: Math.round(summary.caloriesEstimated),
          avg_pace_min_km: summary.avgPaceMinKm ?? null,
          route: Array.isArray(summary.route) ? summary.route : [],
          avg_heart_rate: summary.avgHeartRate ?? null,
          max_heart_rate: summary.maxHeartRate ?? null,
          source: 'apple-watch',
          started_at: summary.startedAt,
          finished_at: summary.finishedAt,
          client_id: buildCardioIdempotencyKey(summary),
        }

        const res = await fetch('/api/gps/cardio/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }).catch(() => null)

        if (res && res.ok) {
          toastCtx?.('Cardio do Watch salvo!', 'success' as const)
          return
        }

        const status = res?.status ?? 0
        if (isTransientStatus(status)) {
          // D-5: o Watch já apagou o cardio da fila DELE ao entregar aqui —
          // sem reenfileirar, uma sessão expirada ou uma queda de rede
          // apagava a corrida inteira. `queueWatchCardioSave` é idempotente
          // pelo mesmo `client_id` acima.
          await queueWatchCardioSave(payload)
          toastCtx?.('Cardio do Watch salvo — será reenviado automaticamente.', 'info' as const)
          return
        }

        // Falha PERMANENTE (400 de payload inválido): reenviar não conserta,
        // então NÃO enfileira — só avisa.
        logWarn('WatchSync', 'cardio-save do Watch falhou definitivamente', status)
        toastCtx?.('Não foi possível salvar o cardio do Watch.', 'error' as const)
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
          return
        }

        // D-1: o Watch manda check-in por PROXIMIDADE (WatchGym = id/lat/lng,
        // sem QR nenhum). `/api/gps/qr-checkin` exige `qr_token` (uuid) — nunca
        // enviado aqui —, então essa chamada voltava 400 em 100% das vezes. O
        // endpoint certo é `/api/gps/checkin`, que aceita exatamente
        // gym_id/latitude/longitude (ver route.ts: "registrar check-in via GPS").
        const res = await fetch('/api/gps/checkin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gym_id: gym.id,
            latitude: gym.latitude,
            longitude: gym.longitude,
          }),
        }).catch(() => null)

        // Antes o toast de sucesso era incondicional (nem olhava o `.catch`
        // nem o status) — comemorava check-in que nunca aconteceu.
        if (res && res.ok) {
          toastCtx?.(`Check-in em ${gym.name}`, 'success' as const)
          return
        }

        logWarn('WatchSync', 'check-in falhou', res?.status)
        const msg = res?.status === 401
          ? 'Sessão expirada no iPhone — abra o app e tente de novo.'
          : `Não foi possível fazer check-in em ${gym.name}.`
        toastCtx?.(msg, 'error' as const)
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
