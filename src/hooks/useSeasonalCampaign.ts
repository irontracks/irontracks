/**
 * @module useSeasonalCampaign
 *
 * Generic "show once per user, only during active window" controller for
 * seasonal popup modals (Mother's Day, Black Friday, Christmas, etc.).
 *
 * Reuses `userSettingsApi` for cross-device persistence (same pattern as
 * `useWhatsNew`). Falls back to `localStorage` for fast paint before
 * settings are loaded — avoids a flash on cold start.
 *
 * @example
 *   const { isOpen, close } = useSeasonalCampaign({
 *     id: 'mothersDay2026',
 *     activeFrom: '2026-05-07',
 *     activeUntil: '2026-05-12',
 *     userId,
 *     userSettingsApi,
 *   })
 */
'use client'

import { useCallback } from 'react'
import { logWarn } from '@/lib/logger'
import type { useUserSettings } from '@/hooks/useUserSettings'

type UserSettingsApi = ReturnType<typeof useUserSettings>

interface UseSeasonalCampaignOptions {
  /** Stable id for this campaign — also the settings key (`seasonal_${id}_seenAt`). */
  id: string
  /** ISO date YYYY-MM-DD (inclusive). */
  activeFrom: string
  /** ISO date YYYY-MM-DD (inclusive). */
  activeUntil: string
  userId?: string | null
  userSettingsApi?: UserSettingsApi | null
  /** Override "now" for tests. Defaults to `Date.now()`. */
  now?: () => number
}

interface UseSeasonalCampaignReturn {
  isOpen: boolean
  close: () => Promise<void>
}

const LS_PREFIX = 'irontracks:seasonal:'

function isInWindow(now: number, fromIso: string, untilIso: string): boolean {
  const from = Date.parse(`${fromIso}T00:00:00`)
  const until = Date.parse(`${untilIso}T23:59:59`)
  if (Number.isNaN(from) || Number.isNaN(until)) return false
  return now >= from && now <= until
}

function getLocalSeen(id: string): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(`${LS_PREFIX}${id}`) === '1'
  } catch {
    return false
  }
}

function setLocalSeen(id: string): void {
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem(`${LS_PREFIX}${id}`, '1')
  } catch {
    /* ignore (private mode, quota) */
  }
}

export function useSeasonalCampaign({
  id,
  activeFrom,
  activeUntil,
  userId,
  userSettingsApi,
  now = Date.now,
}: UseSeasonalCampaignOptions): UseSeasonalCampaignReturn {
  const settingsKey = `seasonal_${id}_seenAt`

  // Derive `isOpen` directly from inputs — no useState/useEffect needed.
  // SSR-safe: `ready` is false until userSettingsApi loads, which only happens
  // client-side, so localStorage is never read during SSR.
  const ready = Boolean(userId) && Boolean(userSettingsApi?.loaded)
  const settings = (userSettingsApi?.settings || {}) as Record<string, unknown>
  const seenAt = Number(settings[settingsKey] || 0)
  const inWindow = isInWindow(now(), activeFrom, activeUntil)
  const localSeen = ready ? getLocalSeen(id) : false
  const isOpen = ready && inWindow && seenAt === 0 && !localSeen

  const close = useCallback(async () => {
    setLocalSeen(id)
    if (!userSettingsApi) return

    const prev = (userSettingsApi.settings || {}) as Record<string, unknown>
    const next = { ...prev, [settingsKey]: now() }
    try {
      userSettingsApi.setSettings?.(
        next as Parameters<NonNullable<typeof userSettingsApi>['setSettings']>[0],
      )
    } catch (e) {
      logWarn('useSeasonalCampaign', 'setSettings failed', e)
    }
    try {
      await userSettingsApi.save?.(
        next as Parameters<NonNullable<typeof userSettingsApi>['save']>[0],
      )
    } catch (e) {
      logWarn('useSeasonalCampaign', 'save failed', e)
    }
  }, [id, settingsKey, userSettingsApi, now])

  return { isOpen, close }
}
