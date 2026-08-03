/**
 * @module useNativeTimerActions
 *
 * Handles interactive notification actions from the iOS native timer.
 * When the user taps "Next Set" or "Skip Rest" on a push notification,
 * the native shell forwards the action here so the web session can
 * advance to the next set automatically.
 *
 * @param session - Active workout session to mutate on action receipt
 */
'use client'

import { useCallback, useEffect } from 'react'
import { onNativeNotificationAction } from '@/utils/native/irontracksNative'
import { logWarnRemote } from '@/lib/logger'
import type { ActiveWorkoutSession } from '@/types/app'

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

/**
 * Idade mínima do descanso para uma ação NATIVA poder encerrá-lo.
 *
 * BUG (relatado em treino, 03/08/2026): "aperto concluir e vai direto pro tempo de
 * treino, não pro descanso" — intermitente, e sempre na PRIMEIRA série do exercício;
 * da 2ª para a 3ª funcionava.
 *
 * Causa: as ações da notificação de tela bloqueada — REST_DONE ("Iniciar Serie") e
 * SKIP_REST ("Pular Descanso") — fecham o timer. O iOS ENFILEIRA essas ações quando
 * o app está suspenso e as entrega quando ele acorda. Sequência real: o usuário toca
 * "Iniciar Serie" no descanso do exercício anterior → o app está suspenso e a ação
 * fica na fila → ele executa a série e aperta concluir → o descanso novo nasce → a
 * ação atrasada finalmente chega e mata o descanso que acabou de nascer. Da 2ª série
 * em diante não há ação pendente, e por isso funcionava.
 *
 * A guarda: ninguém conclui uma série e decide pular o descanso no mesmo segundo.
 * Uma ação que chega sobre um descanso recém-criado é, por construção, resposta a um
 * descanso ANTERIOR — e deve ser descartada.
 */
const FRESH_REST_GRACE_MS = 3_000

interface UseNativeTimerActionsOptions {
  /**
   * Encerramento direto do descanso. NÃO é mais usado pelas ações nativas — elas
   * passam por `closeTimerFromNative`, que descarta entrega atrasada. Mantido na
   * assinatura para não mexer no chamador durante uma correção urgente.
   */
  handleCloseTimer?: () => void
  setActiveSession: React.Dispatch<React.SetStateAction<ActiveWorkoutSession | null>>
}

/**
 * Binds native timer controls coming from two sources:
 *  1. iOS Live Notification actions (@capacitor/push-notifications)
 *     – handled via `onNativeNotificationAction`
 *  2. iOS Live Activity deeplinks (irontracks://action/*)
 *     – handled via the custom DOM event `irontracks:action`
 *
 * Supported actions: SKIP_REST, START_REST, ADD_30S
 *
 * Extracted from IronTracksAppClientImpl to keep the root component lean.
 */
export function useNativeTimerActions({
  setActiveSession,
}: UseNativeTimerActionsOptions) {
  /**
   * Encerra o descanso a pedido do NATIVO, descartando a ação quando ela chega
   * atrasada sobre um descanso recém-criado (ver FRESH_REST_GRACE_MS).
   *
   * A decisão é tomada DENTRO do updater porque só ali se enxerga o estado mais
   * recente: ler `activeSession` da closure devolveria o valor do render anterior —
   * exatamente o tipo de leitura velha que produziria a mesma classe de bug.
   */
  const closeTimerFromNative = useCallback((actionId: string) => {
    setActiveSession((prev) => {
      if (!prev) return prev
      const base = prev as Record<string, unknown>

      const target = Number(base.timerTargetTime)
      if (!Number.isFinite(target) || target <= 0) return prev // nenhum descanso ativo

      const ctx = isRecord(base.timerContext) ? (base.timerContext as Record<string, unknown>) : null
      const startedAt = Number(ctx?.restStartedAtMs)
      const age = Number.isFinite(startedAt) && startedAt > 0 ? Date.now() - startedAt : Number.POSITIVE_INFINITY

      if (age < FRESH_REST_GRACE_MS) {
        // Saída silenciosa NÃO: sem isto o bug volta a ser invisível — foi preciso o
        // dono notar no meio do treino para descobrir que existia.
        logWarnRemote(
          'workout.rest.native-action-ignored',
          'ação nativa atrasada tentou encerrar um descanso recém-criado',
          { actionId, ageMs: age, kind: String(ctx?.kind ?? ''), key: String(ctx?.key ?? '') },
        )
        return prev
      }

      return { ...base, timerTargetTime: null, timerContext: null } as ActiveWorkoutSession
    })
  }, [setActiveSession])

  // ── 1. Notification action (Capacitor push plugin) ────────────────────
  useEffect(() => {
    const off = onNativeNotificationAction((actionId) => {
      if (!actionId) return

      if (actionId === 'SKIP_REST' || actionId === 'START_REST' || actionId === 'REST_DONE') {
        closeTimerFromNative(actionId)
        return
      }

      if (actionId === 'ADD_30S') {
        setActiveSession((prev) => {
          if (!prev) return prev
          const base = prev as Record<string, unknown>
          const ctx = isRecord(base.timerContext)
            ? (base.timerContext as Record<string, unknown>)
            : null
          const kind = String(ctx?.kind || '').trim()
          const t = Number(base.timerTargetTime)
          if (kind !== 'rest' || !Number.isFinite(t) || t <= 0) return prev
          return { ...base, timerTargetTime: t + 30_000 } as ActiveWorkoutSession
        })
      }
    })

    return () => {
      try {
        off()
      } catch {}
    }
  }, [closeTimerFromNative, setActiveSession])

  // ── 2. Live Activity deeplink (irontracks://action/*) ─────────────────
  useEffect(() => {
    const onLiveActivityAction = (e: Event) => {
      try {
        const action = String((e as CustomEvent)?.detail?.action || '').trim()
        if (!action) return
        if (action === 'START_REST' || action === 'SKIP_REST') {
          // Mesma guarda do caminho de notificação: o deeplink da Live Activity
          // sofre do mesmo atraso de entrega quando o app está suspenso.
          closeTimerFromNative(action)
        }
      } catch {}
    }

    window.addEventListener('irontracks:action', onLiveActivityAction)
    return () => window.removeEventListener('irontracks:action', onLiveActivityAction)
  }, [closeTimerFromNative])
}
