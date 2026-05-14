/**
 * @module cardioPersistence
 *
 * IDB-backed persistence for the active cardio (GPS) session.
 * Mirrors `activeSessionPersistence` but holds a different shape:
 * `trackPoints` array + computed `metrics` + `startedAt` epoch.
 *
 * The cardio hook saves to the server only on `stop()`. Without this
 * second layer, a kill mid-run (iOS suspends the WebView, user swipes
 * the app away, low-memory crash) loses 100% of the GPS trail. With
 * it, we flush every ~5s while running and on every lifecycle pause,
 * so the worst-case loss is a handful of seconds — and the user gets
 * a "Retomar corrida?" banner on next mount.
 */

import { kvGet, kvSet } from './idb'
import { logWarn, logInfo } from '@/lib/logger'

const CARDIO_KEY_PREFIX = 'active_cardio_v1_'
const MAX_CARDIO_AGE_MS = 24 * 60 * 60 * 1000 // 24 hours — same as workout sessions

/**
 * Persist the active cardio state to IDB KV store.
 * Called by the hook's 5s debounce while tracking is active, and by
 * the lifecycle flush listeners on tab-hidden / app-pause.
 */
export async function persistActiveCardio(
  userId: string,
  state: Record<string, unknown>,
): Promise<boolean> {
  if (!userId) return false
  try {
    const key = `${CARDIO_KEY_PREFIX}${userId}`
    const payload = { ...state, _idbSavedAt: Date.now() }
    await kvSet(key, payload)
    return true
  } catch (e) {
    logWarn('cardioPersistence', 'IDB persist failed (non-fatal)', e)
    return false
  }
}

/**
 * Recover an active cardio session from IDB. Returns null if no
 * session exists, the session is stale (>24h), required fields are
 * missing, or IDB is unavailable.
 *
 * Validation: must have `trackPoints` as an array AND a truthy
 * `startedAt`. A persisted state without points isn't worth resuming
 * (the user never moved past idle), and without `startedAt` the
 * duration math is broken.
 */
export async function recoverActiveCardio(
  userId: string,
): Promise<Record<string, unknown> | null> {
  if (!userId) return null
  try {
    const key = `${CARDIO_KEY_PREFIX}${userId}`
    const raw = await kvGet(key)
    if (!raw || typeof raw !== 'object') return null

    const state = raw as Record<string, unknown>
    if (!Array.isArray(state.trackPoints)) return null
    if (!state.startedAt) return null

    // Auto-expire stale sessions
    const savedAt = Number(state._idbSavedAt || 0)
    if (savedAt > 0 && Date.now() - savedAt > MAX_CARDIO_AGE_MS) {
      logInfo('cardioPersistence', 'Expired IDB cardio removed', { age: Date.now() - savedAt })
      await clearPersistedCardio(userId)
      return null
    }

    return state
  } catch (e) {
    logWarn('cardioPersistence', 'IDB recovery failed', e)
    return null
  }
}

/**
 * Clear the persisted cardio from IDB.
 * Call on explicit finish (after server save), discard, or sign-out.
 */
export async function clearPersistedCardio(userId: string): Promise<void> {
  if (!userId) return
  try {
    const key = `${CARDIO_KEY_PREFIX}${userId}`
    await kvSet(key, null)
  } catch (e) {
    logWarn('cardioPersistence', 'IDB clear failed', e)
  }
}
