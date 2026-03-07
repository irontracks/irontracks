import { describe, it, expect } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers extracted from workouts/finish/route.ts for isolated testing.
// ─────────────────────────────────────────────────────────────────────────────

const parseTrainingNumberOrZero = (v: unknown) => {
  const n = typeof v === 'number' ? v : Number(String(v || '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

const getExercisePlannedSetsCount = (ex: unknown) => {
  try {
    const exObj = ex && typeof ex === 'object' ? (ex as Record<string, unknown>) : {}
    const bySets = Math.max(0, Number(exObj?.sets) || 0)
    const byDetails = Array.isArray(exObj?.setDetails)
      ? (exObj.setDetails as unknown[]).length
      : Array.isArray(exObj?.set_details)
        ? (exObj.set_details as unknown[]).length
        : 0
    return Math.max(bySets, byDetails)
  } catch {
    return 0
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('parseTrainingNumberOrZero', () => {
  it('returns number as-is', () => {
    expect(parseTrainingNumberOrZero(80)).toBe(80)
    expect(parseTrainingNumberOrZero(0)).toBe(0)
    expect(parseTrainingNumberOrZero(12.5)).toBe(12.5)
  })

  it('parses string numbers', () => {
    expect(parseTrainingNumberOrZero('100')).toBe(100)
    expect(parseTrainingNumberOrZero('12.5')).toBe(12.5)
  })

  it('handles comma as decimal separator', () => {
    expect(parseTrainingNumberOrZero('12,5')).toBe(12.5)
    expect(parseTrainingNumberOrZero('100,0')).toBe(100)
  })

  it('returns 0 for invalid input', () => {
    expect(parseTrainingNumberOrZero(null)).toBe(0)
    expect(parseTrainingNumberOrZero(undefined)).toBe(0)
    expect(parseTrainingNumberOrZero('')).toBe(0)
    expect(parseTrainingNumberOrZero('abc')).toBe(0)
    expect(parseTrainingNumberOrZero(NaN)).toBe(0)
    expect(parseTrainingNumberOrZero(Infinity)).toBe(0)
  })
})

describe('getExercisePlannedSetsCount', () => {
  it('returns sets count from .sets field', () => {
    expect(getExercisePlannedSetsCount({ sets: 4 })).toBe(4)
  })

  it('returns count from setDetails array if larger', () => {
    expect(getExercisePlannedSetsCount({
      sets: 2,
      setDetails: [{ reps: 10 }, { reps: 10 }, { reps: 10 }],
    })).toBe(3)
  })

  it('returns count from set_details (snake_case)', () => {
    expect(getExercisePlannedSetsCount({
      set_details: [{ reps: 8 }, { reps: 8 }],
    })).toBe(2)
  })

  it('takes max of sets and details length', () => {
    expect(getExercisePlannedSetsCount({
      sets: 5,
      setDetails: [{ reps: 10 }, { reps: 10 }],
    })).toBe(5)
  })

  it('returns 0 for null/undefined/invalid', () => {
    expect(getExercisePlannedSetsCount(null)).toBe(0)
    expect(getExercisePlannedSetsCount(undefined)).toBe(0)
    expect(getExercisePlannedSetsCount({})).toBe(0)
    expect(getExercisePlannedSetsCount('string')).toBe(0)
  })
})
