import { describe, it, expect } from 'vitest'
import {
  isCardioExercise,
  parseCadenceSecondsPerRep,
  calculateExerciseDuration,
  estimateWorkoutSeconds,
  toMinutesRounded,
} from '@/utils/pacing'

// ─── isCardioExercise ─────────────────────────────────────────────────────────

describe('isCardioExercise', () => {
  it('returns true for method=cardio', () => {
    expect(isCardioExercise({ method: 'cardio' })).toBe(true)
  })

  it('returns true for type=cardio', () => {
    expect(isCardioExercise({ type: 'cardio' })).toBe(true)
  })

  it('returns true for cardio-related name keywords', () => {
    expect(isCardioExercise({ name: 'Corrida na Esteira' })).toBe(true)
    expect(isCardioExercise({ name: 'Bike Indoor' })).toBe(true)
    expect(isCardioExercise({ name: 'Cardio Intenso' })).toBe(true)
  })

  it('returns false for regular exercises', () => {
    expect(isCardioExercise({ name: 'Supino Reto', method: 'strength' })).toBe(false)
    expect(isCardioExercise({ name: 'Agachamento' })).toBe(false)
  })

  it('handles null gracefully', () => {
    expect(isCardioExercise(null)).toBe(false)
  })
})

// ─── parseCadenceSecondsPerRep ────────────────────────────────────────────────

describe('parseCadenceSecondsPerRep', () => {
  it('returns default (4) for undefined/empty', () => {
    expect(parseCadenceSecondsPerRep(undefined)).toBe(4)
    expect(parseCadenceSecondsPerRep('')).toBe(4)
  })

  it('sums digit values from cadence string', () => {
    // '2020' → 2+0+2+0 = 4
    expect(parseCadenceSecondsPerRep('2020')).toBe(4)
    // '4010' → 4+0+1+0 = 5
    expect(parseCadenceSecondsPerRep('4010')).toBe(5)
    // '3100' → 3+1+0+0 = 4
    expect(parseCadenceSecondsPerRep('3100')).toBe(4)
  })

  it('returns default for non-numeric cadence', () => {
    expect(parseCadenceSecondsPerRep('explosive')).toBe(4)
  })
})

// ─── calculateExerciseDuration ───────────────────────────────────────────────

describe('calculateExerciseDuration', () => {
  it('returns 0 for null input', () => {
    expect(calculateExerciseDuration(null)).toBe(0)
  })

  it('calculates duration for strength exercise with defaults', () => {
    // Formula: (perRep*reps + SET_OVERHEAD + rest) * sets
    // perRep=4, reps=10, SET_OVERHEAD=5, rest=60(default), sets=1
    // → (4*10 + 5 + 60) * 1 = 105
    const result = calculateExerciseDuration({ name: 'Supino', reps: 10, sets: 1 })
    expect(result).toBe(105)
  })

  it('calculates duration for multiple sets', () => {
    // Formula: (perRep*reps + SET_OVERHEAD + rest) * sets
    // perRep=4, reps=10, SET_OVERHEAD=5, rest=90, sets=3
    // → (4*10 + 5 + 90) * 3 = 45+90 = 135 per set × 3 = 405
    const result = calculateExerciseDuration({ name: 'Agachamento', reps: 10, sets: 3, restTime: 90 })
    expect(result).toBe(405)
  })

  it('calculates cardio exercise duration in seconds', () => {
    // cardio, reps=30 (minutes) → 30 * 60 = 1800
    const result = calculateExerciseDuration({ name: 'Corrida', method: 'cardio', reps: 30 })
    expect(result).toBe(1800)
  })

  it('uses default cardio duration when reps missing', () => {
    // DEFAULT_CARDIO_MINUTES = 5 → 5 * 60 = 300
    const result = calculateExerciseDuration({ name: 'Cardio', method: 'cardio' })
    expect(result).toBe(300)
  })
})

// ─── estimateWorkoutSeconds ───────────────────────────────────────────────────

describe('estimateWorkoutSeconds', () => {
  it('returns 0 for empty array', () => {
    expect(estimateWorkoutSeconds([])).toBe(0)
  })

  it('sums durations of multiple exercises', () => {
    const exercises = [
      { name: 'Supino', reps: 10, sets: 1 }, // 105s each (see above)
      { name: 'Agachamento', reps: 10, sets: 1 }, // 105s each
    ]
    expect(estimateWorkoutSeconds(exercises)).toBe(210)
  })

  it('handles non-array gracefully', () => {
    expect(estimateWorkoutSeconds(null as unknown as [])).toBe(0)
  })
})

// ─── toMinutesRounded ─────────────────────────────────────────────────────────

describe('toMinutesRounded', () => {
  it('converts seconds to rounded minutes as string', () => {
    expect(toMinutesRounded(60)).toBe('1')
    expect(toMinutesRounded(90)).toBe('2')
    expect(toMinutesRounded(3600)).toBe('60')
    expect(toMinutesRounded(0)).toBe('0')
  })

  it('handles non-numeric input', () => {
    expect(toMinutesRounded(NaN)).toBe('0')
    expect(toMinutesRounded(null as unknown as number)).toBe('0')
  })
})
