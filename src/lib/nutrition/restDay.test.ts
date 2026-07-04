import { describe, it, expect } from 'vitest'
import { computeRestDayAdjustment } from './restDay'

const base = { calories: 2400, protein: 180, carbs: 240, fat: 70 }

describe('computeRestDayAdjustment', () => {
  it('desconta o gasto médio de um treino da meta', () => {
    const r = computeRestDayAdjustment(base, 300)
    expect(r.reduction).toBe(300)
    expect(r.calories).toBe(2100)
  })

  it('mantém a proteína intacta e corta de carbo + gordura', () => {
    const r = computeRestDayAdjustment(base, 300)
    expect(r.protein).toBe(base.protein)
    expect(r.carbs).toBeLessThan(base.carbs)
    expect(r.fat).toBeLessThan(base.fat)
  })

  it('a queda em kcal dos macros equivale ao desconto aplicado', () => {
    const r = computeRestDayAdjustment(base, 300)
    const baseMacroKcal = base.protein * 4 + base.carbs * 4 + base.fat * 9
    const newMacroKcal = r.protein * 4 + r.carbs * 4 + r.fat * 9
    expect(Math.abs((baseMacroKcal - newMacroKcal) - r.reduction)).toBeLessThanOrEqual(10)
  })

  it('respeita o teto de 500 kcal de desconto', () => {
    const r = computeRestDayAdjustment(base, 900)
    expect(r.reduction).toBe(500)
    expect(r.calories).toBe(1900)
  })

  it('nunca corta mais que 25% da meta', () => {
    const r = computeRestDayAdjustment({ calories: 1600, protein: 120, carbs: 150, fat: 45 }, 500)
    // 25% de 1600 = 400 → piso 1200; desconto limitado a 400
    expect(r.calories).toBeGreaterThanOrEqual(1200)
    expect(r.reduction).toBeLessThanOrEqual(400)
  })

  it('respeita o piso absoluto de 1200 kcal', () => {
    const r = computeRestDayAdjustment({ calories: 1300, protein: 110, carbs: 120, fat: 35 }, 500)
    expect(r.calories).toBeGreaterThanOrEqual(1200)
  })

  it('não mexe quando o desconto seria irrelevante (< 50 kcal)', () => {
    const r = computeRestDayAdjustment(base, 30)
    expect(r.reduction).toBe(0)
    expect(r.calories).toBe(base.calories)
  })

  it('não mexe com gasto médio inválido ou zero', () => {
    expect(computeRestDayAdjustment(base, 0).reduction).toBe(0)
    expect(computeRestDayAdjustment(base, NaN).reduction).toBe(0)
    expect(computeRestDayAdjustment(base, -100).reduction).toBe(0)
  })

  it('devolve meta original sem estourar com meta inválida', () => {
    const r = computeRestDayAdjustment({ calories: 0, protein: 0, carbs: 0, fat: 0 }, 300)
    expect(r.reduction).toBe(0)
    expect(r.calories).toBe(0)
  })

  it('sem carbo/gordura pra cortar, só a meta cai', () => {
    const r = computeRestDayAdjustment({ calories: 2000, protein: 200, carbs: 0, fat: 0 }, 200)
    expect(r.reduction).toBe(200)
    expect(r.calories).toBe(1800)
    expect(r.protein).toBe(200)
  })
})
