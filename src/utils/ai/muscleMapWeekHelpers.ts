/**
 * @module muscleMapWeekHelpers
 *
 * Pure helper functions extracted from muscle-map-week/route.ts
 * to reduce its complexity and improve testability.
 */

import { z } from 'zod'
import { parseJsonWithSchema } from '@/utils/zod'
import { normalizeExerciseName } from '@/utils/normalizeExerciseName'
import { resolveCanonicalExerciseName } from '@/utils/exerciseCanonical'
import { MUSCLE_GROUPS } from '@/utils/muscleMapConfig'

// ────────────────────────────────────────────────────────────────────────────
// Primitives
// ────────────────────────────────────────────────────────────────────────────
export const toStr = (v: unknown): string => String(v || '').trim()

const safeJsonParse = (raw: unknown) => parseJsonWithSchema(raw, z.unknown())

export const extractJsonFromModelText = (text: string) => {
  const cleaned = String(text || '').trim()
  if (!cleaned) return null
  const direct = safeJsonParse(cleaned)
  if (direct) return direct
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  return safeJsonParse(cleaned.slice(start, end + 1))
}

// ────────────────────────────────────────────────────────────────────────────
// Muscle ID normalization
// ────────────────────────────────────────────────────────────────────────────
export const DEFAULT_MUSCLE_ID_SET = new Set(MUSCLE_GROUPS.map((m) => m.id))

export const normalizeMuscleId = (raw: unknown, allowed: Set<string>) => {
  const id = String(raw || '').trim().toLowerCase()
  if (!id) return ''
  if (allowed.has(id)) return id
  if (id === 'abdominal' || id === 'abdominals' || id === 'abdomen' || id === 'core' || id === 'obliques' || id === 'oblique') return 'abs'
  return ''
}

export const normalizeContributions = (mapping: unknown, allowed: Set<string>) => {
  const raw = mapping && typeof mapping === 'object' ? (mapping as Record<string, unknown>) : null
  const contributionsRaw = raw && Array.isArray(raw?.contributions) ? (raw.contributions as unknown[]) : []
  return contributionsRaw
    .map((c) => {
      const obj = c && typeof c === 'object' ? (c as Record<string, unknown>) : null
      const id = normalizeMuscleId(obj?.muscleId, allowed)
      const weight = Number(obj?.weight)
      if (!id || !Number.isFinite(weight) || weight <= 0) return null
      return { muscleId: id, weight }
    })
    .filter(Boolean)
}

export const hasValidMapping = (mapping: unknown, allowed: Set<string>) => {
  return normalizeContributions(mapping, allowed).length > 0
}

// ────────────────────────────────────────────────────────────────────────────
// Date helpers
// ────────────────────────────────────────────────────────────────────────────
export const startOfWeekUtc = (d: Date) => {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const day = date.getUTCDay()
  const diff = (day === 0 ? -6 : 1) - day
  date.setUTCDate(date.getUTCDate() + diff)
  return date
}

export const isoDate = (d: Date) => {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export const addDaysUtc = (d: Date, days: number) => {
  const next = new Date(d.getTime())
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

// ────────────────────────────────────────────────────────────────────────────
// Effort / Sets parsing
// ────────────────────────────────────────────────────────────────────────────
export const parseEffortFactor = (log: unknown) => {
  const l = log && typeof log === 'object' ? (log as Record<string, unknown>) : {}
  const rirRaw = l?.rir ?? l?.RIR
  const rpeRaw = l?.rpe ?? l?.RPE
  const rir = Number(String(rirRaw ?? '').replace(',', '.'))
  if (Number.isFinite(rir)) {
    if (rir <= 1) return 1
    if (rir <= 3) return 0.85
    if (rir <= 4) return 0.7
    return 0.5
  }
  const rpe = Number(String(rpeRaw ?? '').replace(',', '.'))
  if (Number.isFinite(rpe)) {
    if (rpe >= 9) return 1
    if (rpe >= 8) return 0.9
    if (rpe >= 7) return 0.8
    if (rpe >= 6) return 0.7
    return 0.6
  }
  return 1
}

export const parseNumber = (raw: unknown) => {
  const n = Number(String(raw ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export const isSetDone = (log: unknown) => {
  if (!log || typeof log !== 'object') return false
  const logObj = log as Record<string, unknown>
  if (Boolean(logObj?.done)) return true
  const reps = parseNumber(logObj?.reps)
  return reps != null && reps > 0
}

export const plannedSetsCount = (exercise: unknown) => {
  const ex = exercise && typeof exercise === 'object' ? (exercise as Record<string, unknown>) : ({} as Record<string, unknown>)
  const setsArr = Array.isArray(ex?.sets) ? (ex.sets as unknown[]) : null
  if (setsArr) return setsArr.length
  const n = Number(ex?.sets ?? ex?.setsCount ?? ex?.setCount)
  if (Number.isFinite(n) && n > 0) return Math.floor(n)
  return 0
}

// ────────────────────────────────────────────────────────────────────────────
// Color mapping
// ────────────────────────────────────────────────────────────────────────────
export const colorForRatio = (ratio: number) => {
  const r = Number.isFinite(ratio) ? ratio : 0
  if (r <= 0) return ''           // sem treino: transparente
  if (r <= 0.25) return '#fde68a'   // muito baixo: amarelo suave
  if (r <= 0.5) return '#fbbf24'   // baixo: amarelo
  if (r <= 0.75) return '#f59e0b'   // moderado: âmbar
  if (r <= 1.0) return '#ea580c'   // na meta: laranja
  if (r <= 1.3) return '#dc2626'   // alto: vermelho
  return '#991b1b'                   // muito alto: vermelho escuro
}

// ────────────────────────────────────────────────────────────────────────────
// AI response normalization
// ────────────────────────────────────────────────────────────────────────────
export const normalizeAiExerciseMap = (obj: unknown) => {
  const baseObj = obj && typeof obj === 'object' ? (obj as Record<string, unknown>) : ({} as Record<string, unknown>)
  const itemsRaw = Array.isArray(baseObj.items)
    ? (baseObj.items as unknown[])
    : Array.isArray(baseObj.exercises)
      ? (baseObj.exercises as unknown[])
      : []
  const muscleIds: Set<string> = new Set(MUSCLE_GROUPS.map((m) => m.id))

  const items = itemsRaw
    .map((it: unknown) => {
      const item = it && typeof it === 'object' ? (it as Record<string, unknown>) : ({} as Record<string, unknown>)
      const name = toStr(item?.name)
      const canonical =
        toStr(item?.canonical_name || item?.canonicalName || item?.canonical) || (name ? resolveCanonicalExerciseName(name)?.canonical : '')
      const key = normalizeExerciseName(canonical || name)
      if (!key) return null

      const contribRaw = Array.isArray(item?.contributions)
        ? (item.contributions as unknown[])
        : Array.isArray(item?.muscles)
          ? (item.muscles as unknown[])
          : []
      const contributions = contribRaw
        .map((c: unknown) => {
          const contrib = c && typeof c === 'object' ? (c as Record<string, unknown>) : ({} as Record<string, unknown>)
          const muscleId = toStr(contrib?.muscleId || contrib?.id)
          if (!muscleId || !muscleIds.has(muscleId)) return null
          const weight = Number(contrib?.weight ?? contrib?.sets_equivalent)
          if (!Number.isFinite(weight) || weight <= 0) return null
          const role = toStr(contrib?.role || contrib?.type || 'primary') || 'primary'
          return { muscleId, weight, role }
        })
        .filter(Boolean)

      const weightSum = contributions.reduce((acc: number, c: unknown) => {
        const contrib = c && typeof c === 'object' ? (c as Record<string, unknown>) : ({} as Record<string, unknown>)
        return acc + (Number(contrib?.weight) || 0)
      }, 0)
      const normalizedContrib =
        weightSum > 0
          ? contributions.map((c: unknown) => {
            const contrib = c && typeof c === 'object' ? (c as Record<string, unknown>) : ({} as Record<string, unknown>)
            return { ...contrib, weight: (Number(contrib.weight) || 0) / weightSum }
          })
          : []

      const confidenceRaw = Number(item?.confidence)
      const confidence = Number.isFinite(confidenceRaw) ? Math.max(0, Math.min(1, confidenceRaw)) : 0.6

      return {
        exercise_key: key,
        canonical_name: canonical || name,
        mapping: {
          contributions: normalizedContrib,
          unilateral: Boolean(item?.unilateral),
          confidence,
          notes: toStr(item?.notes).slice(0, 240),
        },
        confidence,
      }
    })
    .filter(Boolean)

  return items
}

export const normalizeAiInsights = (obj: unknown) => {
  const base = obj && typeof obj === 'object' ? (obj as Record<string, unknown>) : {}
  const toArr = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x || '').trim()).filter(Boolean) : [])
  const toStrArr = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x || '').trim()).filter(Boolean) : [])
  const alertsRaw = Array.isArray(base?.imbalanceAlerts) ? base.imbalanceAlerts : []
  const recsRaw = Array.isArray(base?.recommendations) ? base.recommendations : []
  const imbalanceAlerts = alertsRaw
    .map((a: unknown) => {
      const aObj = a && typeof a === 'object' ? (a as Record<string, unknown>) : {}
      const type = toStr(aObj?.type).slice(0, 60)
      const severity = toStr(aObj?.severity).slice(0, 20) || 'info'
      const muscles = toStrArr(aObj?.muscles).slice(0, 6)
      const evidence = toStr(aObj?.evidence).slice(0, 240)
      const suggestion = toStr(aObj?.suggestion).slice(0, 240)
      if (!type && !suggestion) return null
      return { type, severity, muscles, evidence, suggestion }
    })
    .filter(Boolean)
    .slice(0, 6)

  const recommendations = recsRaw
    .map((r: unknown) => {
      const rObj = r && typeof r === 'object' ? (r as Record<string, unknown>) : {}
      const title = toStr(rObj?.title).slice(0, 80)
      const actions = toArr(rObj?.actions).slice(0, 5)
      if (!title && !actions.length) return null
      return { title: title || 'Recomendação', actions }
    })
    .filter(Boolean)
    .slice(0, 6)

  return {
    summary: toArr(base?.summary).slice(0, 8),
    imbalanceAlerts,
    recommendations,
  }
}
