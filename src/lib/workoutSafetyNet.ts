/**
 * @module workoutSafetyNet
 *
 * A localStorage-based safety net for finished workouts.
 *
 * The problem: when the user finishes a workout, the data goes through
 * online POST → IDB offline queue → onFinish (clears session). If both
 * the online POST and the IDB queue fail, the data is lost forever.
 *
 * This module saves a full backup of the finish payload to localStorage
 * BEFORE any save attempt. The backup is only cleared after confirmed
 * success. On next app load, orphaned backups can be detected and recovered.
 */

import { logWarn, logInfo, logError } from '@/lib/logger'

const BACKUP_KEY_PREFIX = 'irontracks.finishBackup.v1.'
const MAX_BACKUPS_AGE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

export interface FinishBackup {
  payload: Record<string, unknown>
  workoutTitle: string
  exerciseCount: number
  date: string
  savedAt: number
}

/**
 * Save a finish payload backup to localStorage BEFORE attempting API/IDB save.
 * This is the "insurance policy" — even if everything else fails, this survives.
 */
export function saveFinishBackup(userId: string, payload: Record<string, unknown>): boolean {
  try {
    if (!userId) return false
    const key = `${BACKUP_KEY_PREFIX}${userId}`

    const session = (payload as Record<string, unknown>)?.session as Record<string, unknown> | undefined
    const workoutTitle = String(session?.workoutTitle || session?.workout_title || 'Treino')
    const exercises = Array.isArray(session?.exercises) ? session.exercises : []

    const backup: FinishBackup = {
      payload,
      workoutTitle,
      exerciseCount: exercises.length,
      date: String(session?.date || new Date().toISOString()),
      savedAt: Date.now(),
    }

    localStorage.setItem(key, JSON.stringify(backup))
    logInfo('workoutSafetyNet', 'Finish backup saved', { workoutTitle, exerciseCount: exercises.length })
    return true
  } catch (e) {
    logError('workoutSafetyNet', 'Failed to save finish backup', e)
    return false
  }
}

/**
 * Clear the finish backup — call ONLY after confirmed save success.
 */
export function clearFinishBackup(userId: string): void {
  try {
    if (!userId) return
    const key = `${BACKUP_KEY_PREFIX}${userId}`
    localStorage.removeItem(key)
    logInfo('workoutSafetyNet', 'Finish backup cleared (save confirmed)')
  } catch (e) {
    logWarn('workoutSafetyNet', 'Failed to clear finish backup', e)
  }
}

/**
 * Retrieve an orphaned finish backup, if one exists.
 * Returns null if no backup, or if the backup is older than 7 days.
 */
export function getFinishBackup(userId: string): FinishBackup | null {
  try {
    if (!userId) return null
    const key = `${BACKUP_KEY_PREFIX}${userId}`
    const raw = localStorage.getItem(key)
    if (!raw) return null

    const backup = JSON.parse(raw) as FinishBackup
    if (!backup || typeof backup !== 'object') return null
    if (!backup.payload || typeof backup.payload !== 'object') return null

    // Auto-expire stale backups
    const age = Date.now() - (backup.savedAt || 0)
    if (age > MAX_BACKUPS_AGE_MS) {
      localStorage.removeItem(key)
      logWarn('workoutSafetyNet', 'Stale backup expired and removed', { age })
      return null
    }

    return backup
  } catch (e) {
    logWarn('workoutSafetyNet', 'Failed to read finish backup', e)
    return null
  }
}

/**
 * Quick check if a backup exists without parsing.
 */
export function hasFinishBackup(userId: string): boolean {
  try {
    if (!userId) return false
    return localStorage.getItem(`${BACKUP_KEY_PREFIX}${userId}`) !== null
  } catch {
    return false
  }
}
