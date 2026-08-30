'use client'

import { createContext, useContext, useMemo, useState, useCallback, useEffect, useRef } from 'react'
import { useWorkoutTicker } from './hooks/useWorkoutTicker'
import { formatElapsed, computeRecoveryPauseMs } from './utils'
import { useLiveActivityPauseSync } from '@/hooks/useLiveActivityPauseSync'

// Gap de background/suspensão acima disto é tratado como PAUSA (não é treino):
// app esquecido aberto ou morto e restaurado horas depois.
//
// Já foi 2 min — e isso ERRAVA o tempo para baixo em todo treino real: o
// descanso faz parte da sessão, e descansar 3 min com o celular no bolso (tela
// bloqueada) caía na regra e era descontado. O dono flagrou pelos prints de
// jul/2026: a Ilha Dinâmica marcava ~43 min enquanto o app marcava 35:56 na
// mesma sessão — os 7 min de diferença eram exatamente os descansos com a tela
// apagada. A Live Activity conta tempo de parede puro e estava certa.
//
// 20 min: nenhum descanso legítimo chega perto disso, e o caso que a regra
// existe para pegar ("esqueci o treino aberto", restaurar no dia seguinte)
// passa longe. Mexer aqui muda o tempo gravado no histórico — ver guard em
// `__tests__/workoutElapsedPause.test.tsx`.
export const LONG_GAP_MS = 20 * 60 * 1000

export interface WorkoutTimerValue {
  ticker: number
  elapsedSeconds: number
  formatElapsed: (sec: unknown) => string
  timerMinimized: boolean
  setTimerMinimized: (v: boolean) => void
  isPaused: boolean
  togglePause: () => void
}

const WorkoutTimerCtx = createContext<WorkoutTimerValue | null>(null)

export function useWorkoutTimer(): WorkoutTimerValue {
  const ctx = useContext(WorkoutTimerCtx)
  if (!ctx) throw new Error('useWorkoutTimer must be used within WorkoutTimerProvider')
  return ctx
}

/**
 * Provider that encapsulates the 1-second ticker.
 * Only components that consume `useWorkoutTimer()` re-render each tick.
 * The main WorkoutContext remains stable between user interactions.
 *
 * Pause support: `togglePause` freezes the display timer without stopping
 * the underlying ticker. Paused duration is accumulated in `pausedMs` so
 * that resuming picks up exactly where the user left off.
 */
export function WorkoutTimerProvider({
  startedAtMs,
  lastActiveAtMs = 0,
  children,
}: {
  startedAtMs: number
  /** Timestamp da última atividade persistida (session._idbSavedAt). Se a sessão
   *  foi restaurada após o app ficar morto/suspenso por muito tempo, o gap até
   *  agora conta como pausa inicial — senão o cronômetro inflaria (bug do
   *  "treino de 4h" no histórico ao recuperar). */
  lastActiveAtMs?: number
  children: React.ReactNode
}) {
  const { ticker, timerMinimized, setTimerMinimized } = useWorkoutTicker()

  // pausedMs: total accumulated pause duration (ms)
  // pauseStart: timestamp when the current pause began (null = not paused)
  // Inicializador roda 1x no mount (quando a sessão já existe). Se recuperada
  // após um gap longo, semeia o pausedMs com esse gap (tempo fora do app).
  const [pausedMs, setPausedMs] = useState(0)

  /**
   * Gap do app morto/suspenso — descontado uma vez por sessão.
   *
   * ⚠️ O carimbo pode chegar DEPOIS do mount. `useLocalPersistence` faz
   * `setView('active')` de forma SÍNCRONA (só consulta o portão de
   * restauração), então o `ActiveWorkout` renderiza com `session = null` e este
   * provider monta com `lastActiveAtMs = 0`; quem hidrata é o `useSessionSync`,
   * um tique depois. Enquanto isso só existia no inicializador do `useState`
   * — que roda uma vez —, o gap nunca era descontado nesse caminho: visto no
   * aparelho em 30/08/2026, uma sessão de 17 h esquecida mostrava **1038:28**
   * logo após o app avisar que "o tempo parado não entra na conta".
   *
   * `visibilitychange` não cobre o caso: o app foi RELANÇADO, não voltou de
   * background — não há transição hidden→visible para medir.
   *
   * É ajuste de estado DURANTE O RENDER (padrão documentado do React), não
   * efeito: `setState` em efeito dispara render em cascata, e ler `ref` ou
   * chamar `Date.now()` no corpo do componente quebra as regras de pureza —
   * o ESLint reprova os três, e reprovou cada tentativa antes desta.
   *
   * Semeia só na PRIMEIRA vez que o carimbo aparece. O `_savedAt` é reescrito a
   * cada persistência; recalcular somaria gaps até zerar o cronômetro de quem
   * está treinando normalmente.
   */
  const [recuperacaoMs, setRecuperacaoMs] = useState(() =>
    computeRecoveryPauseMs(lastActiveAtMs, startedAtMs, Date.now(), LONG_GAP_MS),
  )
  const [carimboVisto, setCarimboVisto] = useState(lastActiveAtMs)
  if (lastActiveAtMs !== carimboVisto) {
    setCarimboVisto(lastActiveAtMs)
    // Só quando o carimbo NASCE (0 → válido). Atualização de carimbo já
    // conhecido é persistência normal e não descontaria nada de novo.
    if (carimboVisto <= 0 && lastActiveAtMs > 0 && startedAtMs > 0) {
      setRecuperacaoMs(computeRecoveryPauseMs(lastActiveAtMs, startedAtMs, ticker, LONG_GAP_MS))
    }
  }

  const [pauseStart, setPauseStart] = useState<number | null>(null)

  const isPaused = pauseStart !== null

  const togglePause = useCallback(() => {
    const now = Date.now()
    if (pauseStart !== null) {
      // Resume: add elapsed pause time to the accumulator
      setPausedMs(prev => prev + (now - pauseStart))
      setPauseStart(null)
    } else {
      // Pause: record when the pause started
      setPauseStart(now)
    }
  }, [pauseStart])

  // Background longo (app suspenso/esquecido) vira pausa. O ticker congela quando
  // o documento fica oculto e SALTA pro relógio de parede ao voltar — o que
  // contaria o tempo fora do app como treino. Aqui, se o app ficou oculto por
  // mais que LONG_GAP_MS, somamos esse gap ao pausedMs pra neutralizar o salto.
  // Gap curto (tela bloqueada no meio de uma série) continua contando.
  const hiddenAtRef = useRef<number | null>(null)
  useEffect(() => {
    if (typeof document === 'undefined') return
    const onVisibility = () => {
      if (document.hidden) {
        hiddenAtRef.current = Date.now()
        return
      }
      const hiddenAt = hiddenAtRef.current
      hiddenAtRef.current = null
      if (hiddenAt == null) return
      const gap = Date.now() - hiddenAt
      if (gap > LONG_GAP_MS) setPausedMs(prev => prev + gap)
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  const elapsedSeconds = useMemo(() => {
    if (startedAtMs <= 0) return 0
    // While paused, freeze display at the moment pause began
    const effectiveTicker = isPaused ? (pauseStart ?? ticker) : ticker
    // `pausaDeRecuperacaoMs` entra aqui, e não no `pausedMs`: sendo derivado,
    // o mesmo gap não pode ser somado duas vezes ao estado.
    return Math.max(0, Math.floor((effectiveTicker - startedAtMs - pausedMs - recuperacaoMs) / 1000))
  }, [startedAtMs, ticker, pausedMs, recuperacaoMs, pauseStart, isPaused])

  // A ilha dinâmica e a tela bloqueada contam tempo de PAREDE (o sistema desenha
  // o relógio sozinho). Sem espelhar a pausa daqui, o app marcava "PAUSADO 56:07"
  // e a ilha continuava subindo. O sync vive junto do dono do tempo de propósito:
  // é aqui que `pausedMs` e o desconto de background existem.
  useLiveActivityPauseSync({ isPaused, elapsedSeconds, startedAtMs })

  const value = useMemo<WorkoutTimerValue>(
    () => ({ ticker, elapsedSeconds, formatElapsed, timerMinimized, setTimerMinimized, isPaused, togglePause }),
    [ticker, elapsedSeconds, timerMinimized, setTimerMinimized, isPaused, togglePause],
  )

  return <WorkoutTimerCtx.Provider value={value}>{children}</WorkoutTimerCtx.Provider>
}
