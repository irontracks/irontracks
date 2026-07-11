/**
 * Testes das funções puras de metas nutricionais (BMR/TDEE/macros). Alimentam toda
 * a meta de calorias/macros do app (página de Nutrição e overlay) e não tinham teste
 * dedicado — só uso indireto. Como são puras, dá pra travar os invariantes por import
 * real, sem mock.
 */
import { describe, it, expect } from 'vitest'
import {
  calculateBMR,
  calculateTDEE,
  calculateMacros,
  calculateNutritionGoals,
  getActivityMultiplier,
} from '@/lib/nutrition/goals'

describe('calculateBMR (Mifflin-St Jeor)', () => {
  it('homem: 10·peso + 6.25·altura − 5·idade + 5', () => {
    // 80kg, 180cm, 30a → 800 + 1125 − 150 + 5 = 1780
    expect(calculateBMR({ weight: 80, height: 180, age: 30, gender: 'MALE', activityLevel: 'MODERATE' })).toBe(1780)
  })

  it('mulher: mesma base, porém −161 em vez de +5', () => {
    // 60kg, 165cm, 28a → 600 + 1031.25 − 140 − 161 = 1330.25 → 1330
    expect(calculateBMR({ weight: 60, height: 165, age: 28, gender: 'FEMALE', activityLevel: 'SEDENTARY' })).toBe(1330)
  })

  it('a diferença homem−mulher com os mesmos números é exatamente 166 (+5 vs −161)', () => {
    const base = { weight: 70, height: 170, age: 25, activityLevel: 'MODERATE' } as const
    expect(calculateBMR({ ...base, gender: 'MALE' }) - calculateBMR({ ...base, gender: 'FEMALE' })).toBe(166)
  })

  it('rejeita entradas inválidas', () => {
    const ok = { weight: 80, height: 180, age: 30, gender: 'MALE', activityLevel: 'MODERATE' } as const
    expect(() => calculateBMR({ ...ok, weight: 0 })).toThrow('nutrition_invalid_weight')
    expect(() => calculateBMR({ ...ok, height: -1 })).toThrow('nutrition_invalid_height')
    expect(() => calculateBMR({ ...ok, age: 0 })).toThrow('nutrition_invalid_age')
    // @ts-expect-error gênero inválido de propósito
    expect(() => calculateBMR({ ...ok, gender: 'X' })).toThrow('nutrition_invalid_gender')
  })
})

describe('getActivityMultiplier', () => {
  it('mapeia os níveis conhecidos', () => {
    expect(getActivityMultiplier('SEDENTARY')).toBe(1.2)
    expect(getActivityMultiplier('LIGHT')).toBe(1.375)
    expect(getActivityMultiplier('MODERATE')).toBe(1.55)
    expect(getActivityMultiplier('VERY_ACTIVE')).toBe(1.725)
    expect(getActivityMultiplier('EXTRA_ACTIVE')).toBe(1.9)
  })

  it('cai em MODERATE (1.55) para nível desconhecido/nulo', () => {
    expect(getActivityMultiplier('qualquer')).toBe(1.55)
    expect(getActivityMultiplier(null)).toBe(1.55)
    expect(getActivityMultiplier(undefined)).toBe(1.55)
  })
})

describe('calculateTDEE', () => {
  it('= round(BMR × multiplicador de atividade)', () => {
    // BMR 1780 × 1.55 (MODERATE) = 2759
    expect(calculateTDEE({ weight: 80, height: 180, age: 30, gender: 'MALE', activityLevel: 'MODERATE' })).toBe(2759)
  })
})

describe('calculateMacros', () => {
  it('proteína por g/kg quando o peso é passado (CUT 2.2 / MAINTAIN 2.0 / BULK 1.8)', () => {
    expect(calculateMacros(2500, 'CUT', 80).protein).toBe(176) // 80 × 2.2
    expect(calculateMacros(2500, 'MAINTAIN', 80).protein).toBe(160) // 80 × 2.0
    expect(calculateMacros(2500, 'BULK', 80).protein).toBe(144) // 80 × 1.8
  })

  it('sem peso, cai na proteína por % das calorias (compatibilidade)', () => {
    // MAINTAIN split proteína 0.30 → round(2500 × 0.30 / 4) = round(187.5) = 188
    expect(calculateMacros(2500, 'MAINTAIN').protein).toBe(188)
  })

  it('rejeita calorias e goal inválidos', () => {
    expect(() => calculateMacros(0, 'CUT')).toThrow('nutrition_invalid_calories')
    // @ts-expect-error goal inválido de propósito
    expect(() => calculateMacros(2500, 'RANDOM')).toThrow('nutrition_invalid_goal')
  })
})

describe('calculateNutritionGoals (integração)', () => {
  const stats = { weight: 80, height: 180, age: 30, gender: 'MALE', activityLevel: 'MODERATE' } as const

  it('aplica o multiplicador de calorias por objetivo: CUT < MAINTAIN < BULK', () => {
    const cut = calculateNutritionGoals(stats, 'CUT').calories
    const maintain = calculateNutritionGoals(stats, 'MAINTAIN').calories
    const bulk = calculateNutritionGoals(stats, 'BULK').calories
    expect(cut).toBeLessThan(maintain)
    expect(maintain).toBeLessThan(bulk)
    // MAINTAIN = TDEE (2759); CUT = round(2759×0.85)=2345; BULK = round(2759×1.1)=3035
    expect(maintain).toBe(2759)
    expect(cut).toBe(2345)
    expect(bulk).toBe(3035)
  })

  it('a proteína usa o peso (g/kg), não o % das calorias', () => {
    // MAINTAIN 2.0 g/kg × 80kg = 160
    expect(calculateNutritionGoals(stats, 'MAINTAIN').protein).toBe(160)
  })
})
