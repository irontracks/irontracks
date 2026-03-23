/**
 * @module activeSessionPersistence
 *
 * IDB-backed persistence for the active workout session.
 * Adds a second durability layer beyond localStorage: IndexedDB survives
 * mobile OS cache purges and is more reliable on Capacitor/WebView.
 *
 * Write-through: every save goes to both localStorage AND IDB.
 * Recovery order: IDB first → localStorage fallback → null.
 */

import { kvGet, kvSet } from './idb'
import { logWarn, logInfo } from '@/lib/logger'

const SESSION_KEY_PREFIX = 'active_session_v1_'
const MAX_SESSION_AGE_MS = 24 * 60 * 60 * 1000 // 24 hours

/**
 * Persist the active session to IDB KV store.
 * Called alongside localStorage saves for dual-write durability.
 */
export async function persistActiveSession(
  userId: string,
  session: Record<string, unknown>
): Promise<boolean> {
  if (!userId) return false
  try {
    const key = `${SESSION_KEY_PREFIX}${userId}`
    const payload = { ...session, _idbSavedAt: Date.now() }
    await kvSet(key, payload)
    return true
  } catch (e) {
    logWarn('activeSessionPersistence', 'IDB persist failed (non-fatal)', e)
    return false
  }
}

/**
 * Recover an active session from IDB. Returns null if no session
 * exists, session is stale (>24h), or IDB is unavailable.
 */
export async function recoverActiveSession(
  userId: string
): Promise<Record<string, unknown> | null> {
  if (!userId) return null
  try {
    const key = `${SESSION_KEY_PREFIX}${userId}`
    const raw = await kvGet(key)
    if (!raw || typeof raw !== 'object') return null

    const session = raw as Record<string, unknown>
    if (!session.startedAt || !session.workout) return null

    // Auto-expire stale sessions
    const savedAt = Number(session._idbSavedAt || session._savedAt || 0)
    if (savedAt > 0 && Date.now() - savedAt > MAX_SESSION_AGE_MS) {
      logInfo('activeSessionPersistence', 'Expired IDB session removed', { age: Date.now() - savedAt })
      await clearPersistedSession(userId)
      return null
    }

    return session
  } catch (e) {
    logWarn('activeSessionPersistence', 'IDB recovery failed', e)
    return null
  }
}

/**
 * Clear the persisted session from IDB.
 * Call on explicit finish, cancel, or sign-out.
 */
export async function clearPersistedSession(userId: string): Promise<void> {
  if (!userId) return
  try {
    const key = `${SESSION_KEY_PREFIX}${userId}`
    await kvSet(key, null)
  } catch (e) {
    logWarn('activeSessionPersistence', 'IDB clear failed', e)
  }
}
