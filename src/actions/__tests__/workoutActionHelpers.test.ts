import { describe, it, expect } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers extracted from actions/workout-actions.ts for isolated testing
// without Supabase or Next.js runtime dependencies.
// ─────────────────────────────────────────────────────────────────────────────

const safeString = (v: unknown): string => {
  const s = String(v ?? '').trim()
  return s
}

const safeIso = (v: unknown): string | null => {
  try {
    if (!v) return null
    const d = v instanceof Date ? v : new Date(v as unknown as string | number | Date)
    const t = d.getTime()
    return Number.isFinite(t) ? d.toISOString() : null
  } catch {
    return null
  }
}

const normalizeExerciseKey = (v: unknown): string => {
  return safeString(v)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

const buildExercisesPayload = (workout: unknown): unknown[] => {
  const w = workout && typeof workout === 'object' ? (workout as Record<string, unknown>) : ({} as Record<string, unknown>)
  const exercises = Array.isArray(w.exercises) ? (w.exercises as unknown[]) : []
  return exercises
    .filter((ex) => ex && typeof ex === 'object')
    .map((ex, idx) => {
      const exObj = ex && typeof ex === 'object' ? (ex as Record<string, unknown>) : ({} as Record<string, unknown>)
      const setDetails =
        Array.isArray(exObj.setDetails)
          ? (exObj.setDetails as unknown[])
          : Array.isArray(exObj.set_details)
            ? (exObj.set_details as unknown[])
            : Array.isArray(exObj.sets)
              ? (exObj.sets as unknown[])
              : null
      const headerSets = Number.parseInt(String(exObj.sets ?? ''), 10) || 0
      const numSets = headerSets || (Array.isArray(setDetails) ? setDetails.length : 0)
      const sets: Array<Record<string, unknown>> = []
      for (let i = 0; i < numSets; i += 1) {
        const s = Array.isArray(setDetails) ? (setDetails[i] || null) : null
        const sObj = s && typeof s === 'object' ? (s as Record<string, unknown>) : ({} as Record<string, unknown>)
        sets.push({
          weight: sObj.weight ?? null,
          reps: (sObj.reps ?? exObj.reps) ?? null,
          rpe: (sObj.rpe ?? exObj.rpe) ?? null,
          set_number: (sObj.set_number ?? sObj.setNumber) ?? (i + 1),
          completed: false,
          is_warmup: !!(sObj.is_warmup ?? sObj.isWarmup),
          advanced_config: (sObj.advanced_config ?? sObj.advancedConfig) ?? null,
        })
      }
      return {
        name: safeString(exObj.name || ''),
        notes: safeString(exObj.notes || ''),
        video_url: (exObj.videoUrl ?? exObj.video_url) ?? null,
        rest_time: (exObj.restTime ?? exObj.rest_time) ?? null,
        cadence: exObj.cadence ?? null,
        method: exObj.method ?? null,
        order: idx,
        sets,
      }
    })
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('safeString', () => {
  it('trims whitespace', () => {
    expect(safeString('  hello  ')).toBe('hello')
  })

  it('converts null/undefined to empty string', () => {
    expect(safeString(null)).toBe('')
    expect(safeString(undefined)).toBe('')
  })

  it('converts non-string values', () => {
    expect(safeString(42)).toBe('42')
    expect(safeString(true)).toBe('true')
  })
})

describe('safeIso', () => {
  it('converts valid date string to ISO', () => {
    const result = safeIso('2025-01-15T10:00:00Z')
    expect(result).toBe('2025-01-15T10:00:00.000Z')
  })

  it('converts Date object to ISO', () => {
    const d = new Date('2025-06-01T12:00:00Z')
    expect(safeIso(d)).toBe('2025-06-01T12:00:00.000Z')
  })

  it('returns null for null/undefined/empty', () => {
    expect(safeIso(null)).toBeNull()
    expect(safeIso(undefined)).toBeNull()
    expect(safeIso('')).toBeNull()
    expect(safeIso(0)).toBeNull()
  })

  it('returns null for invalid date', () => {
    expect(safeIso('not-a-date')).toBeNull()
  })
})

describe('normalizeExerciseKey', () => {
  it('lowercases and removes diacritics', () => {
    expect(normalizeExerciseKey('Supino Reto')).toBe('supino reto')
    expect(normalizeExerciseKey('Extensão de Tríceps')).toBe('extensao de triceps')
  })

  it('collapses multiple spaces', () => {
    expect(normalizeExerciseKey('Leg  Press   45')).toBe('leg press 45')
  })

  it('handles null/undefined', () => {
    expect(normalizeExerciseKey(null)).toBe('')
    expect(normalizeExerciseKey(undefined)).toBe('')
  })
})

describe('buildExercisesPayload', () => {
  it('builds payload from exercises with setDetails', () => {
    const workout = {
      exercises: [
        {
          name: 'Supino Reto',
          notes: 'Pesado',
          setDetails: [
            { weight: 80, reps: 10 },
            { weight: 85, reps: 8 },
          ],
        },
      ],
    }
    const result = buildExercisesPayload(workout) as Array<Record<string, unknown>>
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Supino Reto')
    expect(result[0].notes).toBe('Pesado')
    expect(result[0].order).toBe(0)
    const sets = result[0].sets as Array<Record<string, unknown>>
    expect(sets).toHaveLength(2)
    expect(sets[0].weight).toBe(80)
    expect(sets[0].reps).toBe(10)
    expect(sets[1].weight).toBe(85)
    expect(sets[1].reps).toBe(8)
  })

  it('uses sets count as header when larger than setDetails', () => {
    const workout = {
      exercises: [
        { name: 'Agachamento', sets: 4, setDetails: [{ weight: 100 }] },
      ],
    }
    const result = buildExercisesPayload(workout) as Array<Record<string, unknown>>
    const sets = result[0].sets as Array<Record<string, unknown>>
    expect(sets).toHaveLength(4)
  })

  it('returns empty array for null/undefined workout', () => {
    expect(buildExercisesPayload(null)).toEqual([])
    expect(buildExercisesPayload(undefined)).toEqual([])
    expect(buildExercisesPayload({})).toEqual([])
  })

  it('filters out non-object exercises', () => {
    const workout = { exercises: [null, 'invalid', { name: 'Valid' }] }
    const result = buildExercisesPayload(workout) as Array<Record<string, unknown>>
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Valid')
  })

  it('handles snake_case set_details', () => {
    const workout = {
      exercises: [
        { name: 'Remada', set_details: [{ weight: 60, reps: 12 }] },
      ],
    }
    const result = buildExercisesPayload(workout) as Array<Record<string, unknown>>
    const sets = result[0].sets as Array<Record<string, unknown>>
    expect(sets).toHaveLength(1)
    expect(sets[0].weight).toBe(60)
  })

  it('maps videoUrl → video_url and restTime → rest_time', () => {
    const workout = {
      exercises: [
        { name: 'Rosca', videoUrl: 'https://v.mp4', restTime: 90, sets: 1 },
      ],
    }
    const result = buildExercisesPayload(workout) as Array<Record<string, unknown>>
    expect(result[0].video_url).toBe('https://v.mp4')
    expect(result[0].rest_time).toBe(90)
  })

  it('sets completed: false and preserves is_warmup', () => {
    const workout = {
      exercises: [
        { name: 'Warmup', setDetails: [{ weight: 20, isWarmup: true }] },
      ],
    }
    const result = buildExercisesPayload(workout) as Array<Record<string, unknown>>
    const sets = result[0].sets as Array<Record<string, unknown>>
    expect(sets[0].completed).toBe(false)
    expect(sets[0].is_warmup).toBe(true)
  })
})
