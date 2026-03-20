import { describe, it, expect } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers tested in isolation — extracted patterns from sync-templates.
// ─────────────────────────────────────────────────────────────────────────────

/** Normalizes a workout title for template matching */
const normalizeTitle = (raw: unknown): string => {
  const s = String(raw ?? '').trim()
  if (!s) return 'Treino'
  // Remove leading "Treino X - " pattern if present, normalize whitespace
  return s.replace(/\s+/g, ' ').trim()
}

/** Checks if two dates represent the same calendar day */
const isSameDay = (a: unknown, b: unknown): boolean => {
  try {
    const da = new Date(String(a ?? ''))
    const db = new Date(String(b ?? ''))
    if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return false
    return da.toISOString().slice(0, 10) === db.toISOString().slice(0, 10)
  } catch {
    return false
  }
}

/** Safely extracts exercise count from a session JSON */
const countExercises = (notes: unknown): number => {
  try {
    const obj = typeof notes === 'string' ? JSON.parse(notes) : notes
    if (!obj || typeof obj !== 'object') return 0
    const exercises = (obj as Record<string, unknown>)?.exercises
    return Array.isArray(exercises) ? exercises.length : 0
  } catch {
    return 0
  }
}

/** Computes diff between two numeric values, with null safety */
const numericDiff = (current: unknown, previous: unknown): number | null => {
  const a = Number(current)
  const b = Number(previous)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  return Math.round((a - b) * 100) / 100
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('sync-templates helpers', () => {
  describe('normalizeTitle', () => {
    it('trims whitespace', () => {
      expect(normalizeTitle('  Treino A  ')).toBe('Treino A')
    })

    it('collapses multiple spaces', () => {
      expect(normalizeTitle('Treino   A')).toBe('Treino A')
    })

    it('returns "Treino" for empty string', () => {
      expect(normalizeTitle('')).toBe('Treino')
    })

    it('returns "Treino" for null/undefined', () => {
      expect(normalizeTitle(null)).toBe('Treino')
      expect(normalizeTitle(undefined)).toBe('Treino')
    })

    it('preserves valid titles', () => {
      expect(normalizeTitle('Treino A - Peito e Tríceps')).toBe('Treino A - Peito e Tríceps')
    })
  })

  describe('isSameDay', () => {
    it('returns true for same day different time', () => {
      expect(isSameDay('2026-03-18T08:00:00Z', '2026-03-18T20:00:00Z')).toBe(true)
    })

    it('returns false for different days', () => {
      expect(isSameDay('2026-03-18', '2026-03-19')).toBe(false)
    })

    it('returns false for invalid dates', () => {
      expect(isSameDay('not-a-date', '2026-03-18')).toBe(false)
      expect(isSameDay(null, null)).toBe(false)
    })

    it('handles date-only strings', () => {
      expect(isSameDay('2026-03-18', '2026-03-18')).toBe(true)
    })
  })

  describe('countExercises', () => {
    it('counts exercises from object', () => {
      expect(countExercises({ exercises: [{}, {}, {}] })).toBe(3)
    })

    it('counts exercises from JSON string', () => {
      expect(countExercises(JSON.stringify({ exercises: [{}, {}] }))).toBe(2)
    })

    it('returns 0 for missing exercises', () => {
      expect(countExercises({ title: 'Treino A' })).toBe(0)
    })

    it('returns 0 for null/undefined', () => {
      expect(countExercises(null)).toBe(0)
      expect(countExercises(undefined)).toBe(0)
    })

    it('returns 0 for invalid JSON', () => {
      expect(countExercises('not json')).toBe(0)
    })

    it('returns 0 for non-array exercises', () => {
      expect(countExercises({ exercises: 'not an array' })).toBe(0)
    })
  })

  describe('numericDiff', () => {
    it('computes positive diff', () => {
      expect(numericDiff(100, 80)).toBe(20)
    })

    it('computes negative diff', () => {
      expect(numericDiff(70, 80)).toBe(-10)
    })

    it('handles decimal precision', () => {
      expect(numericDiff(12.345, 12.1)).toBe(0.25)
    })

    it('returns null for non-finite values', () => {
      expect(numericDiff(NaN, 80)).toBe(null)
      expect(numericDiff(80, 'abc')).toBe(null)
      expect(numericDiff(undefined, 80)).toBe(null)
    })

    it('treats null as 0 (Number(null) === 0)', () => {
      expect(numericDiff(null, 80)).toBe(-80)
    })

    it('handles string numbers', () => {
      expect(numericDiff('100', '80')).toBe(20)
    })

    it('returns 0 for equal values', () => {
      expect(numericDiff(80, 80)).toBe(0)
    })
  })
})
