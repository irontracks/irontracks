'use client'

/**
 * @module useWorkoutRecovery
 *
 * On dashboard mount, checks for orphaned workout finish backups in localStorage.
 * If one is found, exposes state for a recovery banner to display.
 */

import { useState, useEffect, useCallback } from 'react'
import { getFinishBackup, clearFinishBackup, type FinishBackup } from '@/lib/workoutSafetyNet'
import { queueFinishWorkout, isOnline } from '@/lib/offline/offlineSync'
import { logInfo, logError } from '@/lib/logger'

export interface WorkoutRecoveryState {
  backup: FinishBackup | null
  recovering: boolean
  recovered: boolean
  error: string | null
  retryRecovery: () => Promise<void>
  dismissRecovery: () => void
}

export function useWorkoutRecovery(userId: string | null | undefined): WorkoutRecoveryState {
  const [backup, setBackup] = useState<FinishBackup | null>(null)
  const [recovering, setRecovering] = useState(false)
  const [recovered, setRecovered] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Check for orphaned backup on mount
  useEffect(() => {
    const uid = String(userId || '').trim()
    if (!uid) return
    const found = getFinishBackup(uid)
    if (found) {
      logInfo('workoutRecovery', 'Orphaned workout backup detected', {
        title: found.workoutTitle,
        exerciseCount: found.exerciseCount,
        date: found.date,
      })
      setBackup(found)
    }
  }, [userId])

  const retryRecovery = useCallback(async () => {
    const uid = String(userId || '').trim()
    if (!uid || !backup) return

    setRecovering(true)
    setError(null)

    try {
      const payload = backup.payload

      // Try online first
      if (isOnline()) {
        try {
          const resp = await fetch('/api/workouts/finish', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })

          if (resp.ok) {
            clearFinishBackup(uid)
            setBackup(null)
            setRecovered(true)
            logInfo('workoutRecovery', 'Workout recovered successfully (online)')
            return
          }

          // 4xx = terminal, don't retry
          if (resp.status >= 400 && resp.status < 500) {
            const errText = await resp.text()
            setError(`Erro de validação: ${errText}`)
            clearFinishBackup(uid) // Don't keep invalid data
            setBackup(null)
            return
          }
        } catch (fetchErr) {
          logError('workoutRecovery', 'Online recovery failed, trying offline queue', fetchErr)
        }
      }

      // Fallback to IDB queue
      try {
        await queueFinishWorkout(payload as Record<string, unknown>)
        clearFinishBackup(uid)
        setBackup(null)
        setRecovered(true)
        logInfo('workoutRecovery', 'Workout recovered successfully (offline queue)')
      } catch (queueErr) {
        logError('workoutRecovery', 'Both online and offline recovery failed', queueErr)
        setError('Não foi possível recuperar. Tente novamente mais tarde.')
      }
    } catch (e) {
      setError(String((e as Error)?.message || 'Erro inesperado'))
    } finally {
      setRecovering(false)
    }
  }, [userId, backup])

  const dismissRecovery = useCallback(() => {
    const uid = String(userId || '').trim()
    if (uid) {
      clearFinishBackup(uid)
      logInfo('workoutRecovery', 'User dismissed recovery backup')
    }
    setBackup(null)
  }, [userId])

  return { backup, recovering, recovered, error, retryRecovery, dismissRecovery }
}
