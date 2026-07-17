import { describe, it, expect } from 'vitest'
import { macroCaloriePercents } from '../macroSplit'

describe('macroCaloriePercents — % por caloria, não por grama', () => {
  it('o almoço reportado: P70 C69 G42 é 30/30/40, não 39/38/23', () => {
    // Por grama (o bug): 70/181=39%, 69/181=38%, 42/181=23%.
    // Por caloria: 280 / 276 / 378 kcal de 934 → 30 / 30 / 40.
    const s = macroCaloriePercents({ protein: 70, carbs: 69, fat: 42 })
    expect(s).toEqual({ protein: 30, carbs: 30, fat: 40 })
  })

  it('sempre soma 100 (a gordura fecha o resto)', () => {
    for (const m of [
      { protein: 70, carbs: 69, fat: 42 },
      { protein: 33, carbs: 3, fat: 28 },
      { protein: 1, carbs: 1, fat: 1 },
      { protein: 22, carbs: 95, fat: 8 },
    ]) {
      const s = macroCaloriePercents(m)
      expect(s.protein + s.carbs + s.fat).toBe(100)
    }
  })

  it('gordura pura = 100% gordura', () => {
    expect(macroCaloriePercents({ protein: 0, carbs: 0, fat: 20 })).toEqual({ protein: 0, carbs: 0, fat: 100 })
  })

  it('proteína pura = 100% proteína', () => {
    expect(macroCaloriePercents({ protein: 50, carbs: 0, fat: 0 })).toEqual({ protein: 100, carbs: 0, fat: 0 })
  })

  it('tudo zero → 0/0/0, sem divisão por zero', () => {
    expect(macroCaloriePercents({ protein: 0, carbs: 0, fat: 0 })).toEqual({ protein: 0, carbs: 0, fat: 0 })
    expect(macroCaloriePercents(null)).toEqual({ protein: 0, carbs: 0, fat: 0 })
  })

  it('entrada suja não vira NaN nem negativo', () => {
    const s = macroCaloriePercents({ protein: NaN as unknown as number, carbs: -5, fat: 10 })
    expect(s).toEqual({ protein: 0, carbs: 0, fat: 100 })
  })

  it('a gordura nunca fica negativa mesmo com arredondamento adverso', () => {
    // Caso extremo: valores que poderiam empurrar protein+carbs > 100.
    const s = macroCaloriePercents({ protein: 1, carbs: 1, fat: 0.01 })
    expect(s.fat).toBeGreaterThanOrEqual(0)
    expect(s.protein + s.carbs + s.fat).toBe(100)
  })
})
