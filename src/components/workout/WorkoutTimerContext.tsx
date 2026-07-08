'use client'

import { createContext, useContext, useMemo, useState, useCallback, useEffect, useRef } from 'react'
import { useWorkoutTicker } from './hooks/useWorkoutTicker'
import { formatElapsed, computeRecoveryPauseMs } from './utils'

// Gap de background/suspensão acima disto é tratado como PAUSA (não é treino):
// app esquecido aberto, tela bloqueada por muito tempo, ou morto e restaurado.
// Abaixo disto (ex.: tela bloqueada no meio de uma série) continua contando.
const LONG_GAP_MS = 2 * 60 * 1000

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
  const [pausedMs, setPausedMs] = useState(() => computeRecoveryPauseMs(lastActiveAtMs, startedAtMs, Date.now(), LONG_GAP_MS))
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
    return Math.max(0, Math.floor((effectiveTicker - startedAtMs - pausedMs) / 1000))
  }, [startedAtMs, ticker, pausedMs, pauseStart, isPaused])

  const value = useMemo<WorkoutTimerValue>(
    () => ({ ticker, elapsedSeconds, formatElapsed, timerMinimized, setTimerMinimized, isPaused, togglePause }),
    [ticker, elapsedSeconds, timerMinimized, setTimerMinimized, isPaused, togglePause],
  )

  return <WorkoutTimerCtx.Provider value={value}>{children}</WorkoutTimerCtx.Provider>
}
