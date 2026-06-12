import { describe, it, expect } from 'vitest'
import { estimateSessionKcal } from '../sessionKcal'

// Sessão sintética: ~60 min, volume moderado, 2 exercícios.
const session = {
  totalTime: 3600,
  executionTotalSeconds: 900,
  restTotalSeconds: 1500,
  exercises: [{ name: 'Agachamento livre' }, { name: 'Leg press' }],
  logs: {
    '0-0': { done: true, weight: '100', reps: '10' },
    '0-1': { done: true, weight: '100', reps: '10' },
    '1-0': { done: true, weight: '200', reps: '12' },
    '1-1': { done: true, weight: '200', reps: '12' },
  },
}

describe('estimateSessionKcal', () => {
  it('returns a realistic kcal for a strength session', () => {
    const kcal = estimateSessionKcal(session, { bodyWeightKg: 90, biologicalSex: 'male' })
    expect(kcal).toBeGreaterThan(150)
    expect(kcal).toBeLessThan(900)
  })

  it('scales with body weight', () => {
    const light = estimateSessionKcal(session, { bodyWeightKg: 60, biologicalSex: 'male' })
    const heavy = estimateSessionKcal(session, { bodyWeightKg: 110, biologicalSex: 'male' })
    expect(heavy).toBeGreaterThan(light)
  })

  it('applies the female correction (lower than male, same body weight)', () => {
    const male = estimateSessionKcal(session, { bodyWeightKg: 70, biologicalSex: 'male' })
    const female = estimateSessionKcal(session, { bodyWeightKg: 70, biologicalSex: 'female' })
    expect(female).toBeLessThan(male)
  })

  it('falls back to pre-checkin body weight when profile weight is absent', () => {
    const withPreCheckin = { ...session, preCheckin: { weight: '95' } }
    const kcal = estimateSessionKcal(withPreCheckin, {})
    expect(kcal).toBeGreaterThan(150)
  })

  it('returns 0 for empty / invalid sessions', () => {
    expect(estimateSessionKcal(null)).toBe(0)
    expect(estimateSessionKcal({})).toBe(0)
    expect(estimateSessionKcal({ totalTime: 0, logs: {} })).toBe(0)
  })
})
