/**
 * Single source of truth for "was this set completed?" in the client-side report.
 *
 * Historically the post-workout report counted a set as complete only when
 * `log.weight > 0 || log.reps > 0`. That rule misses unilateral sets, which
 * save their values in `L_weight`/`R_weight`/`L_reps`/`R_reps` and never
 * populate the top-level `weight`/`reps`. The primary signal is `log.done`,
 * which the set renderers set once the user marks the set done (both sides
 * for unilateral exercises). Numeric fallbacks cover legacy sessions that
 * predate the `done` flag or were imported without it.
 */

type SetLogLike = {
  done?: unknown
  L_done?: unknown
  R_done?: unknown
  weight?: unknown
  reps?: unknown
  L_weight?: unknown
  R_weight?: unknown
  L_reps?: unknown
  R_reps?: unknown
}

const isTruthy = (v: unknown): boolean => {
  if (v === true) return true
  if (typeof v === 'string') return v.trim().toLowerCase() === 'true'
  return false
}

const isPositiveNumber = (v: unknown): boolean => {
  if (v == null || v === '') return false
  const n = Number(String(v).replace(',', '.'))
  return Number.isFinite(n) && n > 0
}

export function isSetCompleted(log: unknown): boolean {
  if (!log || typeof log !== 'object') return false
  const l = log as SetLogLike

  if (isTruthy(l.done)) return true
  if (isTruthy(l.L_done) && isTruthy(l.R_done)) return true

  if (isPositiveNumber(l.weight) || isPositiveNumber(l.reps)) return true
  if (isPositiveNumber(l.L_weight) || isPositiveNumber(l.R_weight)) return true
  if (isPositiveNumber(l.L_reps) || isPositiveNumber(l.R_reps)) return true

  return false
}
