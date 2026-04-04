'use client'

import { createContext, useContext, useMemo } from 'react'
import { useWorkoutTicker } from './hooks/useWorkoutTicker'
import { formatElapsed } from './utils'

export interface WorkoutTimerValue {
  ticker: number
  elapsedSeconds: number
  formatElapsed: (sec: unknown) => string
  timerMinimized: boolean
  setTimerMinimized: (v: boolean) => void
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
 */
export function WorkoutTimerProvider({
  startedAtMs,
  children,
}: {
  startedAtMs: number
  children: React.ReactNode
}) {
  const { ticker, timerMinimized, setTimerMinimized } = useWorkoutTicker()

  const elapsedSeconds = useMemo(
    () => (startedAtMs > 0 ? Math.max(0, Math.floor((ticker - startedAtMs) / 1000)) : 0),
    [startedAtMs, ticker],
  )

  const value = useMemo<WorkoutTimerValue>(
    () => ({ ticker, elapsedSeconds, formatElapsed, timerMinimized, setTimerMinimized }),
    [ticker, elapsedSeconds, timerMinimized, setTimerMinimized],
  )

  return <WorkoutTimerCtx.Provider value={value}>{children}</WorkoutTimerCtx.Provider>
}
