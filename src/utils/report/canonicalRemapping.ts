/**
 * @file canonicalRemapping.ts
 *
 * Pure utility functions for remapping exercise keys and session data to their
 * canonical names using a pre-built alias → canonical name map.
 *
 * These helpers are intentionally stateless (no hooks, no side effects) so they
 * can be used in both React hooks and non-React contexts (e.g. PDF generation
 * handlers, API routes, or tests).
 *
 * The canonical map is produced by the exercise library and resolves aliases
 * like "supino reto" → "Supino Reto com Barra" so that all analytics, PRs, and
 * volume calculations use consistent keys across sessions.
 */

import { normalizeExerciseName } from '@/utils/normalizeExerciseName'
import { normalizeExerciseKey } from '@/utils/report/formatters'

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Safely coerce an unknown value to a Record<string, unknown>. */
const toRecord = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : {}

/**
 * Resolve a raw exercise name to its canonical normalised key.
 *
 * 1. Normalise the raw name (lower-case, accent-strip, trim)
 * 2. Look up the resulting alias in `canonicalMap`
 * 3. Normalise the canonical name to produce a stable object key
 */
const resolveCanonicalKey = (rawName: string, canonicalMap: Record<string, unknown>): string => {
  const aliasNorm = normalizeExerciseName(rawName)
  const canonicalName = String(canonicalMap[aliasNorm] || rawName).trim() || rawName
  return normalizeExerciseKey(canonicalName)
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Re-index a `prevLogsByExercise` map so every entry is stored under the
 * canonical exercise key instead of the original alias.
 *
 * When two aliases resolve to the same canonical key the log arrays are merged
 * by position — a slot filled in the canonical entry takes precedence.
 *
 * @param prevLogsByExercise  Raw logs map keyed by (possibly aliased) name
 * @param canonicalMap        alias → canonical name lookup table
 * @returns New map keyed by canonical name
 */
export const remapPrevLogsByCanonical = (
  prevLogsByExercise: unknown,
  canonicalMap: unknown,
): Record<string, unknown> => {
  try {
    const src = toRecord(prevLogsByExercise)
    const map = toRecord(canonicalMap)
    const out: Record<string, unknown> = {}

    Object.keys(src).forEach((k) => {
      const baseKey = String(k || '').trim()
      if (!baseKey) return
      const nextKey = resolveCanonicalKey(baseKey, map)
      if (!nextKey) return

      const logsArr = Array.isArray(src[k]) ? (src[k] as unknown[]) : []
      if (!out[nextKey]) {
        out[nextKey] = logsArr
        return
      }

      // Merge two arrays by position — prefer existing values
      const merged = Array.isArray(out[nextKey]) ? (out[nextKey] as unknown[]).slice() : []
      const maxLen = Math.max(merged.length, logsArr.length)
      for (let i = 0; i < maxLen; i += 1) {
        if (merged[i] == null && logsArr[i] != null) merged[i] = logsArr[i]
      }
      out[nextKey] = merged
    })

    return out
  } catch {
    return toRecord(prevLogsByExercise)
  }
}

/**
 * Re-index a `prevBaseMsByExercise` map (base milliseconds per exercise) to
 * use canonical exercise keys.
 *
 * First-write wins: if two aliases resolve to the same canonical key the value
 * from the first alias encountered is kept.
 *
 * @param prevBaseMsByExercise  Raw map keyed by (possibly aliased) name
 * @param canonicalMap          alias → canonical name lookup table
 * @returns New map keyed by canonical name
 */
export const remapPrevBaseMsByCanonical = (
  prevBaseMsByExercise: unknown,
  canonicalMap: unknown,
): Record<string, unknown> => {
  try {
    const src = toRecord(prevBaseMsByExercise)
    const map = toRecord(canonicalMap)
    const out: Record<string, unknown> = {}

    Object.keys(src).forEach((k) => {
      const baseKey = String(k || '').trim()
      if (!baseKey) return
      const nextKey = resolveCanonicalKey(baseKey, map)
      if (!nextKey) return
      if (out[nextKey] == null) out[nextKey] = src[k]
    })

    return out
  } catch {
    return toRecord(prevBaseMsByExercise)
  }
}

/**
 * Return a copy of `sessionObj` where every exercise name has been replaced by
 * its canonical form (as defined in `canonicalMap`).
 *
 * If an exercise name has no alias mapping it is left unchanged. The original
 * object is never mutated.
 *
 * @param sessionObj    Workout session containing an `exercises` array
 * @param canonicalMap  alias → canonical name lookup table
 * @returns Updated session object (or the original on error)
 */
export const applyCanonicalNamesToSession = (
  sessionObj: unknown,
  canonicalMap: unknown,
): unknown => {
  try {
    const base = sessionObj && typeof sessionObj === 'object'
      ? (sessionObj as Record<string, unknown>)
      : null
    if (!base) return sessionObj

    const map = toRecord(canonicalMap)
    const exs = Array.isArray(base.exercises) ? (base.exercises as unknown[]) : []
    if (!exs.length) return sessionObj

    const nextExercises = exs.map((ex: unknown) => {
      try {
        const exObj = ex && typeof ex === 'object' ? (ex as Record<string, unknown>) : ({} as Record<string, unknown>)
        const rawName = String(exObj.name || '').trim()
        if (!rawName) return ex
        const aliasNorm = normalizeExerciseName(rawName)
        const canonicalName = String(map[aliasNorm] || rawName).trim()
        if (!canonicalName || canonicalName === rawName) return ex
        return { ...exObj, name: canonicalName }
      } catch {
        return ex
      }
    })

    return { ...base, exercises: nextExercises }
  } catch {
    return sessionObj
  }
}
