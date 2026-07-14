import { describe, it, expect } from 'vitest'
import { estimateWorkoutMinutes, countTotalSets } from '@/utils/workout/estimateDuration'

describe('countTotalSets', () => {
  it('soma séries por setDetails ou sets', () => {
    expect(countTotalSets([{ sets: 4 }, { sets: 3 }, { setDetails: [1, 2] }])).toBe(9)
  })
  it('entrada inválida → 0', () => {
    expect(countTotalSets(null)).toBe(0)
    expect(countTotalSets(undefined)).toBe(0)
  })
})

describe('estimateWorkoutMinutes', () => {
  it('estima por séries × (execução + descanso)', () => {
    // 4 séries × (40s + 60s default) = 400s ≈ 7 min
    expect(estimateWorkoutMinutes([{ sets: 4 }])).toBe(7)
  })

  it('usa o restTime do exercício quando definido', () => {
    // 3 × (40 + 90) = 390s ≈ 7 min (usa rest 90, não o default)
    expect(estimateWorkoutMinutes([{ sets: 3, restTime: 90 }])).toBe(7)
  })

  it('cardio conta como bloco fixo (~20 min)', () => {
    expect(estimateWorkoutMinutes([{ method: 'cardio', sets: 1 }])).toBe(20)
  })

  it('lista vazia → 0', () => {
    expect(estimateWorkoutMinutes([])).toBe(0)
    expect(estimateWorkoutMinutes(null)).toBe(0)
  })

  it('treino completo dá estimativa plausível', () => {
    const ex = Array.from({ length: 7 }).map(() => ({ sets: 4, restTime: 75 }))
    const min = estimateWorkoutMinutes(ex)
    expect(min).toBeGreaterThan(40)
    expect(min).toBeLessThan(80)
  })
})
