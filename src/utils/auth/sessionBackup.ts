/**
 * @module sessionBackup
 *
 * Centralizes the WKWebView session-backup tokens that we cache in
 * localStorage so the app can re-hydrate the Supabase session after a
 * cold start when HTTP-only cookies fail to propagate (a known iOS
 * Capacitor / WKWebView quirk).
 *
 * Why this needs its own helper:
 *
 *   1. **Plain-text tokens in localStorage are reachable from XSS.** We
 *      can't fully avoid that as long as the iOS bridge needs them,
 *      but we can shrink the blast radius:
 *        - only write the backup on iOS native (not in browsers, where
 *          HTTP-only cookies work fine);
 *        - stamp every entry with `savedAt` and refuse to read it back
 *          if it's older than {@link MAX_BACKUP_AGE_MS} (24h).
 *      A stolen token is now usable for at most 24h instead of forever.
 *
 *   2. **One source of truth.** Previously three different call sites
 *      wrote to `it.session.backup` directly with slightly different
 *      shapes / no expiry / no platform check. Centralizing avoids
 *      drift when we add fields later.
 *
 * The matching cleanup lives in `useSignOut.ts` and `/auth/logout/route.ts`.
 */
import { isIosNative } from '@/utils/platform'
import { logWarn } from '@/lib/logger'

const STORAGE_KEY = 'it.session.backup'
const MAX_BACKUP_AGE_MS = 24 * 60 * 60 * 1000 // 24h

interface BackupShape {
  access_token: string
  refresh_token: string
  savedAt: number
}

/**
 * Persist the session tokens to localStorage **only on iOS native**, with a
 * 24h expiry. No-op on web (cookies handle it) and during SSR.
 */
export function writeSessionBackup(accessToken: string, refreshToken: string): void {
  if (typeof window === 'undefined') return
  if (!isIosNative()) return
  if (!accessToken || !refreshToken) return
  try {
    const payload: BackupShape = {
      access_token: accessToken,
      refresh_token: refreshToken,
      savedAt: Date.now(),
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch (e) {
    logWarn('sessionBackup', 'failed to write', e)
  }
}

/**
 * Read the session backup. Returns null when:
 *   - SSR / no localStorage
 *   - key is missing or unparsable
 *   - either token field is missing
 *   - the entry is older than {@link MAX_BACKUP_AGE_MS}
 *
 * If the entry is expired or malformed it's removed as a side-effect to
 * keep stale tokens from sitting around.
 */
export function readSessionBackup(): { access_token: string; refresh_token: string } | null {
  if (typeof window === 'undefined') return null
  let raw: string | null
  try { raw = window.localStorage.getItem(STORAGE_KEY) } catch { return null }
  if (!raw) return null
  let parsed: Partial<BackupShape> | null = null
  try { parsed = JSON.parse(raw) as Partial<BackupShape> } catch {
    try { window.localStorage.removeItem(STORAGE_KEY) } catch { /* swallow */ }
    return null
  }
  const access = String(parsed?.access_token ?? '')
  const refresh = String(parsed?.refresh_token ?? '')
  const savedAt = Number(parsed?.savedAt ?? 0)
  if (!access || !refresh) {
    clearSessionBackup()
    return null
  }
  // Untrusted savedAt: missing or older than the window → discard.
  if (!Number.isFinite(savedAt) || savedAt <= 0 || Date.now() - savedAt > MAX_BACKUP_AGE_MS) {
    clearSessionBackup()
    return null
  }
  return { access_token: access, refresh_token: refresh }
}

export function clearSessionBackup(): void {
  if (typeof window === 'undefined') return
  try { window.localStorage.removeItem(STORAGE_KEY) } catch { /* swallow */ }
}
