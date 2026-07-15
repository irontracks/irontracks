
import type { UnknownRecord } from '@/types/app'
export const FEATURE_KEYS: Record<string, string> = {}

export const FEATURE_META: Record<string, { key: string; owner: string; review_at: string }> = {}


const isObject = (v: unknown): v is UnknownRecord => Boolean(v && typeof v === 'object' && !Array.isArray(v))

export const isKillSwitchOn = (settings: unknown): boolean => {
  const s = isObject(settings) ? settings : ({} as UnknownRecord)
  return s.featuresKillSwitch === true
}

/**
 * Check if a feature is enabled. Accepts either:
 * - user settings (legacy, per-user flags)
 * - global flags from /api/feature-flags (DB-backed)
 * Global flags take precedence when provided.
 */
export const isFeatureEnabled = (settings: unknown, key: string, globalFlags?: unknown): boolean => {
  // Global DB flags take precedence
  if (isObject(globalFlags) && key in globalFlags) {
    if (globalFlags.featuresKillSwitch === true) return false
    return globalFlags[key] === true
  }
  // Fallback to user settings
  if (isKillSwitchOn(settings)) return false
  const s = isObject(settings) ? settings : ({} as UnknownRecord)
  return s[key] === true
}

export const listFeatureFlags = () => {
  return Object.entries(FEATURE_META).map(([name, meta]) => ({ name, ...meta }))
}
