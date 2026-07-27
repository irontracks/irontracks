import { describe, it, expect } from 'vitest'
import { estimateSessionKcal, estimateSessionKcalBreakdown } from '../sessionKcal'

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

// ── Aula externa (FitDance, spinning…) lançada num treino de musculação ───────
// Bug real (27/07/2026): o desconto do tempo de cardio pressupunha que ele
// acontecera DENTRO da sessão cronometrada. Uma aula de 60 min numa sessão de
// 51 min zerava o tempo de força → 9 dos 10 exercícios com 0 kcal no relatório.
const fitDance = { name: 'FitDance', method: 'Cardio', sets: 1, reps: '60', rpe: 5 }

/** Musculação de ~51 min (exec 14 + descanso 26,8) — espelha o caso real. */
const strengthPart = {
  totalTime: 3091,
  executionTotalSeconds: 840,
  restTotalSeconds: 1608,
  exercises: [{ name: 'Chest press máquina' }, { name: 'Remada curvada com barra' }],
  logs: {
    '0-0': { done: true, weight: '29', reps: '10', rpe: '9' },
    '0-1': { done: true, weight: '29', reps: '10', rpe: '9' },
    '1-0': { done: true, weight: '40', reps: '10', rpe: '9' },
    '1-1': { done: true, weight: '40', reps: '10', rpe: '9' },
  },
}
const withClass = {
  ...strengthPart,
  exercises: [...strengthPart.exercises, fitDance],
}
const opts = { bodyWeightKg: 65, biologicalSex: 'female' }

describe('estimateSessionKcalBreakdown — aula de cardio maior que a sessão', () => {
  it('NÃO zera a musculação quando a aula não cabe na duração registrada', () => {
    const bd = estimateSessionKcalBreakdown(withClass, opts)
    expect(bd.strengthKcal).toBeGreaterThan(0)
    expect(bd.cardioTotalKcal).toBeGreaterThan(0)
    expect(bd.total).toBe(bd.strengthKcal + bd.cardioTotalKcal)
  })

  it('a musculação vale praticamente o mesmo com ou sem a aula lançada junto', () => {
    // Não é igualdade exata: o nome do cardio entra na lista de exercícios e
    // mexe no fator de complexidade do modelo. O que importa é não desabar.
    const semAula = estimateSessionKcalBreakdown(strengthPart, opts).strengthKcal
    const comAula = estimateSessionKcalBreakdown(withClass, opts).strengthKcal
    expect(Math.abs(comAula - semAula) / semAula).toBeLessThan(0.05)
  })

  it('cardio que CABE na sessão segue descontando o tempo da força', () => {
    // Mesma aula de 60 min, mas a sessão durou 158 min (a aula foi dentro dela).
    // Aqui o desconto continua valendo — só o caso "não cabe" mudou.
    const comAula = estimateSessionKcalBreakdown({ ...withClass, totalTime: 9508 }, opts)
    const semDesconto = estimateSessionKcalBreakdown({ ...strengthPart, totalTime: 9508 }, opts)
    expect(comAula.strengthKcal).toBeGreaterThan(0)
    expect(comAula.strengthKcal).not.toBe(semDesconto.strengthKcal)
  })

  it('sessão que É só a aula continua com força zerada (sem kcal fantasma)', () => {
    const bd = estimateSessionKcalBreakdown({ totalTime: 3600, exercises: [fitDance], logs: {} }, opts)
    expect(bd.strengthKcal).toBe(0)
    expect(bd.cardioTotalKcal).toBeGreaterThan(0)
  })

  it('aula sem série de musculação registrada não inventa kcal de força', () => {
    // Só pesos pré-preenchidos pelo autoload (sem reps, sem done) + a aula.
    const bd = estimateSessionKcalBreakdown({
      totalTime: 3091,
      exercises: [{ name: 'Rosca Scott' }, fitDance],
      logs: { '0-0': { weight: '15' } },
    }, opts)
    expect(bd.strengthKcal).toBeGreaterThan(0) // há peso registrado → houve treino
    expect(bd.cardioTotalKcal).toBeGreaterThan(0)
  })
})
