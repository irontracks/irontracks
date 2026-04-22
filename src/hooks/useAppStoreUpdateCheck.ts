'use client'

import { useEffect, useState, useCallback } from 'react'
import { isIosNative } from '@/utils/platform'
import { isNewerVersion } from '@/utils/version/compareVersions'
import { logWarn } from '@/lib/logger'

/** Apple iTunes Lookup response (only the fields we care about). */
interface ItunesLookupResult {
  version?: string
  trackViewUrl?: string
  releaseNotes?: string
  currentVersionReleaseDate?: string
}
interface ItunesLookupResponse {
  resultCount?: number
  results?: ItunesLookupResult[]
}

export interface AppStoreUpdateState {
  /** True when a newer version is live on the App Store AND the user hasn't dismissed it. */
  updateAvailable: boolean
  /** Current running bundle version (from @capacitor/app). */
  currentVersion: string | null
  /** Latest version from App Store Connect (via iTunes Lookup). */
  latestVersion: string | null
  /** Deep link to open the app's App Store page. */
  appStoreUrl: string | null
  /** Release notes text from App Store Connect, if any. */
  releaseNotes: string | null
  /** Mark the current latest as "seen" — banner won't show again until an even newer version appears. */
  dismiss: () => void
}

const DEFAULT_BUNDLE_ID = 'com.irontracks.app'
/** Re-check once per 24h to avoid hammering iTunes on every app open. */
const CACHE_KEY = 'appUpdateCheck:v1'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000
/** Track which versions the user already dismissed so we don't nag repeatedly. */
const DISMISSED_KEY = 'appUpdateCheck:dismissed:v1'

interface Cached {
  fetchedAt: number
  latestVersion: string
  appStoreUrl: string
  releaseNotes: string
}

function readCache(): Cached | null {
  try {
    if (typeof window === 'undefined') return null
    const raw = window.localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Cached
    if (!parsed?.fetchedAt || Date.now() - parsed.fetchedAt > CACHE_TTL_MS) return null
    return parsed
  } catch {
    return null
  }
}

function writeCache(c: Cached): void {
  try {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(c))
  } catch {
    // Quota / incognito / SSR — safe to ignore
  }
}

function readDismissedVersion(): string | null {
  try {
    if (typeof window === 'undefined') return null
    return window.localStorage.getItem(DISMISSED_KEY)
  } catch {
    return null
  }
}

function writeDismissedVersion(v: string): void {
  try {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(DISMISSED_KEY, v)
  } catch {
    // best-effort
  }
}

/**
 * Check the App Store for a newer version of the currently running iOS app.
 *
 * Only runs on iOS native builds — returns an inert state on web and Android.
 *
 * Data flow:
 *   1. Read @capacitor/app to get the installed bundle version.
 *   2. Hit https://itunes.apple.com/lookup?bundleId=... with a 24h cache.
 *   3. Compare — if the store version is newer AND the user hasn't dismissed
 *      the banner for that exact version, surface `updateAvailable: true`.
 *
 * Why 24h cache: the iTunes Lookup API updates 2-24h after App Store release.
 * Running it on every foreground would waste network and still be slow to
 * reflect a fresh submission.
 *
 * @param bundleId override bundle ID — defaults to com.irontracks.app
 */
export function useAppStoreUpdateCheck(bundleId: string = DEFAULT_BUNDLE_ID): AppStoreUpdateState {
  const [currentVersion, setCurrentVersion] = useState<string | null>(null)
  const [latestVersion, setLatestVersion] = useState<string | null>(null)
  const [appStoreUrl, setAppStoreUrl] = useState<string | null>(null)
  const [releaseNotes, setReleaseNotes] = useState<string | null>(null)
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null)

  useEffect(() => {
    if (!isIosNative()) return
    setDismissedVersion(readDismissedVersion())

    let alive = true

    void (async () => {
      // 1. Read current bundle version from Capacitor
      try {
        // Dynamic import keeps @capacitor/app off the web bundle.
        const mod = await import('@capacitor/app')
        const info = await mod.App.getInfo()
        if (!alive) return
        setCurrentVersion(String(info?.version || '') || null)
      } catch (e) {
        logWarn('useAppStoreUpdateCheck.getInfo', 'failed', e)
        return
      }

      // 2. Read from cache if fresh; else hit iTunes Lookup
      const cached = readCache()
      if (cached) {
        setLatestVersion(cached.latestVersion)
        setAppStoreUrl(cached.appStoreUrl)
        setReleaseNotes(cached.releaseNotes)
        return
      }

      try {
        // country=BR because that's the primary rollout market. The iTunes
        // Lookup API returns the App Store version visible in that country
        // — staged rollouts can differ across regions.
        const url = `https://itunes.apple.com/lookup?bundleId=${encodeURIComponent(bundleId)}&country=BR`
        const resp = await fetch(url, { method: 'GET', cache: 'no-store' })
        if (!alive || !resp.ok) return
        const json = (await resp.json()) as ItunesLookupResponse
        const first = Array.isArray(json?.results) ? json.results[0] : null
        const v = String(first?.version || '').trim()
        const appUrl = String(first?.trackViewUrl || '').trim()
        const notes = String(first?.releaseNotes || '').trim()
        if (!v) return

        writeCache({ fetchedAt: Date.now(), latestVersion: v, appStoreUrl: appUrl, releaseNotes: notes })
        if (!alive) return
        setLatestVersion(v)
        setAppStoreUrl(appUrl || null)
        setReleaseNotes(notes || null)
      } catch (e) {
        logWarn('useAppStoreUpdateCheck.fetch', 'iTunes Lookup failed', e)
      }
    })()

    return () => { alive = false }
  }, [bundleId])

  const dismiss = useCallback(() => {
    if (!latestVersion) return
    writeDismissedVersion(latestVersion)
    setDismissedVersion(latestVersion)
  }, [latestVersion])

  const hasNewer = isNewerVersion(latestVersion, currentVersion)
  const isDismissed = dismissedVersion !== null && latestVersion !== null && dismissedVersion === latestVersion

  return {
    updateAvailable: hasNewer && !isDismissed,
    currentVersion,
    latestVersion,
    appStoreUrl,
    releaseNotes,
    dismiss,
  }
}
