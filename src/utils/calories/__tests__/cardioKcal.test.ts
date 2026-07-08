import { describe, it, expect } from 'vitest'
import { estimateCardioKcal, isCardioExercise, metForCardio } from '../cardioKcal'
import { estimateSessionKcal } from '../sessionKcal'

describe('isCardioExercise', () => {
  it('detecta por type, method e nome de modalidade', () => {
    expect(isCardioExercise({ type: 'cardio' })).toBe(true)
    expect(isCardioExercise({ method: 'Cardio' })).toBe(true)
    expect(isCardioExercise({ name: 'Esteira' })).toBe(true)
    expect(isCardioExercise({ name: 'Elíptico' })).toBe(true) // acento
  })

  it('não marca exercício de força', () => {
    expect(isCardioExercise({ name: 'Supino reto', type: 'strength', method: 'Normal' })).toBe(false)
    expect(isCardioExercise(null)).toBe(false)
  })
})

describe('metForCardio', () => {
  it('corrida > esteira > caminhada na mesma intensidade', () => {
    const rpe = 5
    expect(metForCardio('Corrida', rpe, false)).toBeGreaterThan(metForCardio('Esteira', rpe, false))
    expect(metForCardio('Esteira', rpe, false)).toBeGreaterThan(metForCardio('Caminhada', rpe, false))
  })

  it('RPE 5 é neutro (met = base)', () => {
    expect(metForCardio('Corrida', 5, false)).toBeCloseTo(9.8, 5)
  })

  it('intensidade maior aumenta o MET', () => {
    expect(metForCardio('Esteira', 8, false)).toBeGreaterThan(metForCardio('Esteira', 3, false))
  })

  it('HIT aplica +15%', () => {
    expect(metForCardio('Esteira', 5, true)).toBeCloseTo(metForCardio('Esteira', 5, false) * 1.15, 5)
  })

  it('modalidade desconhecida usa o default', () => {
    expect(metForCardio('Modalidade X', 5, false)).toBeCloseTo(6.0, 5)
  })
})

describe('estimateCardioKcal', () => {
  it('esteira 10 min, RPE 8, 78 kg, masculino ≈ 94 kcal', () => {
    const session = { exercises: [{ name: 'Esteira', type: 'cardio', reps: 10, rpe: 8 }] }
    const res = estimateCardioKcal(session, { bodyWeightKg: 78, biologicalSex: 'male' })
    // met = 6.0 × 1.21 = 7.26 ; kcal = 7.26 × 78 × (10/60) = 94.38
    expect(res.totalKcal).toBe(94)
    expect(res.cardioMinutes).toBe(10)
    expect(res.perExerciseKcal[0]).toBe(94)
  })

  it('feminino aplica fator de sexo (0.90)', () => {
    const session = { exercises: [{ name: 'Esteira', type: 'cardio', reps: 10, rpe: 8 }] }
    const res = estimateCardioKcal(session, { bodyWeightKg: 78, biologicalSex: 'female' })
    expect(res.totalKcal).toBe(85) // 94.38 × 0.90 = 84.94
  })

  it('corrida 30 min RPE 5 ≈ 382 kcal', () => {
    const session = { exercises: [{ name: 'Corrida', type: 'cardio', reps: 30, rpe: 5 }] }
    const res = estimateCardioKcal(session, { bodyWeightKg: 78, biologicalSex: 'male' })
    // 9.8 × 78 × 0.5 = 382.2
    expect(res.totalKcal).toBe(382)
  })

  it('HIT queima mais que o mesmo cardio sem HIT', () => {
    const base = { name: 'Esteira', type: 'cardio', reps: 15, rpe: 7 }
    const semHit = estimateCardioKcal({ exercises: [base] }, { bodyWeightKg: 80 })
    const comHit = estimateCardioKcal(
      { exercises: [{ ...base, setDetails: [{ advanced_config: { isHIT: true } }] }] },
      { bodyWeightKg: 80 },
    )
    expect(comHit.totalKcal).toBeGreaterThan(semHit.totalKcal)
  })

  it('sem cardio retorna zeros', () => {
    const session = { exercises: [{ name: 'Supino reto', type: 'strength', reps: 10 }] }
    const res = estimateCardioKcal(session, { bodyWeightKg: 78 })
    expect(res).toEqual({ totalKcal: 0, cardioMinutes: 0, perExerciseKcal: {} })
  })

  it('tempo inválido (0 ou fora de 1-240) é ignorado', () => {
    const session = { exercises: [{ name: 'Esteira', type: 'cardio', reps: 0, rpe: 8 }] }
    expect(estimateCardioKcal(session, { bodyWeightKg: 78 }).totalKcal).toBe(0)
  })
})

describe('estimateSessionKcal — integração de cardio', () => {
  it('sessão só de cardio ≈ kcal do cardio (força zerada)', () => {
    const session = {
      totalTime: 600, // 10 min
      exercises: [{ name: 'Esteira', type: 'cardio', reps: 10, rpe: 8 }],
      logs: {},
    }
    const kcal = estimateSessionKcal(session, { bodyWeightKg: 78, biologicalSex: 'male' })
    expect(kcal).toBe(94)
  })

  it('cardio conta MAIS que se fosse tratado como atividade leve', () => {
    const session = {
      totalTime: 1800, // 30 min
      exercises: [{ name: 'Corrida', type: 'cardio', reps: 30, rpe: 8 }],
      logs: {},
    }
    const kcal = estimateSessionKcal(session, { bodyWeightKg: 78, biologicalSex: 'male' })
    // Modelo leve (MET 3.5) daria ~136 kcal em 30 min; corrida intensa deve ser bem mais.
    expect(kcal).toBeGreaterThan(300)
  })
})
