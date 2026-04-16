'use client'

import { createContext, useContext, useMemo, useState, useCallback } from 'react'
import { useWorkoutTicker } from './hooks/useWorkoutTicker'
import { formatElapsed } from './utils'

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
  children,
}: {
  startedAtMs: number
  children: React.ReactNode
}) {
  const { ticker, timerMinimized, setTimerMinimized } = useWorkoutTicker()

  // pausedMs: total accumulated pause duration (ms)
  // pauseStart: timestamp when the current pause began (null = not paused)
  const [pausedMs, setPausedMs] = useState(0)
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
