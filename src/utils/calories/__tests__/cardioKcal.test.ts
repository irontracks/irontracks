import { describe, it, expect } from 'vitest'
import { estimateCardioKcal, isCardioExercise, metForCardio, clampSessionKcal, MAX_SESSION_KCAL } from '../cardioKcal'
import { estimateSessionKcal, estimateSessionKcalBreakdown } from '../sessionKcal'

describe('clampSessionKcal', () => {
  it('mantém valores válidos (arredondando)', () => {
    expect(clampSessionKcal(561.4)).toBe(561)
  })
  it('capa no máximo de sanidade (anti-forja do bike outdoor)', () => {
    expect(clampSessionKcal(999_999)).toBe(MAX_SESSION_KCAL)
  })
  it('retorna 0 pra inválidos / não-positivos', () => {
    expect(clampSessionKcal(0)).toBe(0)
    expect(clampSessionKcal(-10)).toBe(0)
    expect(clampSessionKcal(NaN)).toBe(0)
    expect(clampSessionKcal('abc')).toBe(0)
    expect(clampSessionKcal(null)).toBe(0)
  })
})

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

/**
 * ⚠️ Os setups abaixo incluem `logs` com `done: true` porque, desde ago/2026,
 * cardio só conta quando FOI FEITO (ver o bloco "cardio só conta o que foi
 * FEITO" no fim do arquivo). A matemática verificada aqui é a mesma; o que
 * mudou é que a entrada agora precisa representar execução, não plano.
 * `feito(min)` monta o log equivalente ao tempo alvo.
 */
const feito = (min: number) => ({ '0-0': { done: true, durationSeconds: min * 60 } })

describe('estimateCardioKcal', () => {
  it('esteira 10 min, RPE 8, 78 kg, masculino ≈ 94 kcal', () => {
    const session = { exercises: [{ name: 'Esteira', type: 'cardio', reps: 10, rpe: 8 }], logs: feito(10) }
    const res = estimateCardioKcal(session, { bodyWeightKg: 78, biologicalSex: 'male' })
    // met = 6.0 × 1.21 = 7.26 ; kcal = 7.26 × 78 × (10/60) = 94.38
    expect(res.totalKcal).toBe(94)
    expect(res.cardioMinutes).toBe(10)
    expect(res.perExerciseKcal[0]).toBe(94)
  })

  it('feminino aplica fator de sexo (0.90)', () => {
    const session = { exercises: [{ name: 'Esteira', type: 'cardio', reps: 10, rpe: 8 }], logs: feito(10) }
    const res = estimateCardioKcal(session, { bodyWeightKg: 78, biologicalSex: 'female' })
    expect(res.totalKcal).toBe(85) // 94.38 × 0.90 = 84.94
  })

  it('corrida 30 min RPE 5 ≈ 382 kcal', () => {
    const session = { exercises: [{ name: 'Corrida', type: 'cardio', reps: 30, rpe: 5 }], logs: feito(30) }
    const res = estimateCardioKcal(session, { bodyWeightKg: 78, biologicalSex: 'male' })
    // 9.8 × 78 × 0.5 = 382.2
    expect(res.totalKcal).toBe(382)
  })

  it('HIT queima mais que o mesmo cardio sem HIT', () => {
    const base = { name: 'Esteira', type: 'cardio', reps: 15, rpe: 7 }
    const semHit = estimateCardioKcal({ exercises: [base], logs: feito(15) }, { bodyWeightKg: 80 })
    const comHit = estimateCardioKcal(
      { exercises: [{ ...base, setDetails: [{ advanced_config: { isHIT: true } }] }], logs: feito(15) },
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
    const session = { exercises: [{ name: 'Esteira', type: 'cardio', reps: 0, rpe: 8 }], logs: feito(0) }
    expect(estimateCardioKcal(session, { bodyWeightKg: 78 }).totalKcal).toBe(0)
  })
})

describe('estimateSessionKcal — integração de cardio', () => {
  it('sessão só de cardio ≈ kcal do cardio (força zerada)', () => {
    const session = {
      totalTime: 600, // 10 min
      exercises: [{ name: 'Esteira', type: 'cardio', reps: 10, rpe: 8 }],
      logs: { '0-0': { done: true, durationSeconds: 600 } },
    }
    const kcal = estimateSessionKcal(session, { bodyWeightKg: 78, biologicalSex: 'male' })
    expect(kcal).toBe(94)
  })

  it('cardio conta MAIS que se fosse tratado como atividade leve', () => {
    const session = {
      totalTime: 1800, // 30 min
      exercises: [{ name: 'Corrida', type: 'cardio', reps: 30, rpe: 8 }],
      logs: { '0-0': { done: true, durationSeconds: 1800 } },
    }
    const kcal = estimateSessionKcal(session, { bodyWeightKg: 78, biologicalSex: 'male' })
    // Modelo leve (MET 3.5) daria ~136 kcal em 30 min; corrida intensa deve ser bem mais.
    expect(kcal).toBeGreaterThan(300)
  })
})

describe('estimateSessionKcalBreakdown', () => {
  it('separa força × cardio e o total fecha', () => {
    const session = {
      totalTime: 600,
      exercises: [{ name: 'Esteira', type: 'cardio', reps: 10, rpe: 8 }],
      logs: { '0-0': { done: true, durationSeconds: 600 } },
    }
    const bd = estimateSessionKcalBreakdown(session, { bodyWeightKg: 78, biologicalSex: 'male' })
    expect(bd.cardioTotalKcal).toBe(94)
    expect(bd.cardioPerExerciseKcal[0]).toBe(94)
    expect(bd.strengthKcal).toBe(0) // sessão só de cardio
    expect(bd.total).toBe(bd.strengthKcal + bd.cardioTotalKcal)
  })

  it('sessão sem cardio: cardio zerado, total = força', () => {
    const session = {
      totalTime: 1200,
      exercises: [{ name: 'Supino reto', type: 'strength', reps: 10 }],
      logs: { '0-0': { weight: 80, reps: 10, done: true } },
    }
    const bd = estimateSessionKcalBreakdown(session, { bodyWeightKg: 80, biologicalSex: 'male' })
    expect(bd.cardioTotalKcal).toBe(0)
    expect(bd.total).toBe(bd.strengthKcal)
  })
})

/**
 * Bug relatado pelo dono (ago/2026): "quando você não faz a esteira e finaliza o
 * treino, ele soma como se tivesse feito".
 *
 * Causa: o cálculo lia `ex.reps` — o tempo PLANEJADO no editor — e nunca olhava
 * os logs. Um "Esteira 20 min" deixado no plano e pulado somava 20 minutos e as
 * kcal correspondentes, para qualquer usuário.
 *
 * O dado certo sempre existiu: `CardioSetInput` grava `done: true` e
 * `durationSeconds` (tempo real do START até parar).
 */
describe('cardio só conta o que foi FEITO', () => {
  const ESTEIRA = { name: 'Esteira', method: 'Cardio', reps: 20, rpe: 5 }
  const base = (logs: Record<string, unknown>) => ({ exercises: [ESTEIRA], logs })

  it('planejado e NÃO feito → zero (o bug)', () => {
    // Sem log nenhum: o exercício ficou no plano e a pessoa pulou.
    const r = estimateCardioKcal(base({}), { bodyWeightKg: 80 })
    expect(r.totalKcal).toBe(0)
    expect(r.cardioMinutes).toBe(0)
    expect(r.perExerciseKcal).toEqual({})
  })

  it('log existe mas sem `done` → zero (rascunho não é execução)', () => {
    // Digitou velocidade/inclinação e não iniciou: ainda é plano.
    const r = estimateCardioKcal(base({ '0-0': { speed: 8, incline: 2 } }), { bodyWeightKg: 80 })
    expect(r.totalKcal).toBe(0)
    expect(r.cardioMinutes).toBe(0)
  })

  it('feito conta o tempo REAL, não o planejado', () => {
    // Planejou 20 min, parou aos 5 (300s). Só os 5 valem.
    const r = estimateCardioKcal(
      base({ '0-0': { done: true, durationSeconds: 300 } }),
      { bodyWeightKg: 80 },
    )
    expect(r.cardioMinutes).toBeCloseTo(5, 5)
    const cheio = estimateCardioKcal(
      base({ '0-0': { done: true, durationSeconds: 1200 } }),
      { bodyWeightKg: 80 },
    )
    // 5 min tem de gastar MUITO menos que 20 — e bater a proporção.
    expect(r.totalKcal).toBeLessThan(cheio.totalKcal)
    expect(r.totalKcal / cheio.totalKcal).toBeCloseTo(0.25, 1)
  })

  it('mais de uma série soma os tempos feitos', () => {
    const r = estimateCardioKcal(
      base({ '0-0': { done: true, durationSeconds: 300 }, '0-1': { done: true, durationSeconds: 600 } }),
      { bodyWeightKg: 80 },
    )
    expect(r.cardioMinutes).toBeCloseTo(15, 5)
  })

  it('série não concluída não entra junto com a concluída', () => {
    const r = estimateCardioKcal(
      base({ '0-0': { done: true, durationSeconds: 300 }, '0-1': { speed: 9 } }),
      { bodyWeightKg: 80 },
    )
    expect(r.cardioMinutes).toBeCloseTo(5, 5)
  })

  it('sessão antiga (done sem durationSeconds) mantém o planejado', () => {
    // Retrocompatibilidade: a pessoa marcou como feito antes de existir o
    // cronômetro. Zerar aqui apagaria histórico real.
    const r = estimateCardioKcal(base({ '0-0': { done: true } }), { bodyWeightKg: 80 })
    expect(r.cardioMinutes).toBe(20)
    expect(r.totalKcal).toBeGreaterThan(0)
  })

  it('não confunde o log de OUTRO exercício', () => {
    const s = { exercises: [{ name: 'Supino', method: 'Normal' }, ESTEIRA], logs: { '0-0': { done: true, durationSeconds: 900 } } }
    const r = estimateCardioKcal(s, { bodyWeightKg: 80 })
    expect(r.totalKcal).toBe(0) // o log é do supino, a esteira não foi feita
  })
})
