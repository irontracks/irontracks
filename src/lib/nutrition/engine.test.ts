import { describe, it, expect } from 'vitest'
import { calculateBMR, calculateTDEE, calculateMacros, calculateNutritionGoals, getActivityMultiplier } from './engine'
import type { UserStats } from './engine'

// ── getActivityMultiplier ────────────────────────────────────────
describe('getActivityMultiplier', () => {
  it('returns correct multipliers for known levels', () => {
    expect(getActivityMultiplier('SEDENTARY')).toBe(1.2)
    expect(getActivityMultiplier('LIGHT')).toBe(1.375)
    expect(getActivityMultiplier('MODERATE')).toBe(1.55)
    expect(getActivityMultiplier('VERY_ACTIVE')).toBe(1.725)
    expect(getActivityMultiplier('EXTRA_ACTIVE')).toBe(1.9)
  })

  it('falls back to MODERATE for unknown/null values', () => {
    expect(getActivityMultiplier(null)).toBe(1.55)
    expect(getActivityMultiplier(undefined)).toBe(1.55)
    expect(getActivityMultiplier('INVALID')).toBe(1.55)
    expect(getActivityMultiplier('')).toBe(1.55)
  })
})

// ── calculateBMR ────────────────────────────────────────────────
describe('calculateBMR', () => {
  const maleStats: UserStats = { weight: 80, height: 180, age: 30, gender: 'MALE', activityLevel: 'MODERATE' }
  const femaleStats: UserStats = { weight: 60, height: 165, age: 25, gender: 'FEMALE', activityLevel: 'MODERATE' }

  it('calculates male BMR correctly (Mifflin-St Jeor)', () => {
    // 88.362 + 13.397*80 + 4.799*180 - 5.677*30 = 88.362 + 1071.76 + 863.82 - 170.31 = 1853.632
    const bmr = calculateBMR(maleStats)
    expect(bmr).toBe(1854) // Math.round(1853.632)
  })

  it('calculates female BMR correctly', () => {
    // 447.593 + 9.247*60 + 3.098*165 - 4.33*25 = 447.593 + 554.82 + 511.17 - 108.25 = 1405.333
    const bmr = calculateBMR(femaleStats)
    expect(bmr).toBe(1405) // Math.round(1405.333)
  })

  it('returns a positive number', () => {
    expect(calculateBMR(maleStats)).toBeGreaterThan(0)
    expect(calculateBMR(femaleStats)).toBeGreaterThan(0)
  })

  it('throws on invalid weight', () => {
    expect(() => calculateBMR({ ...maleStats, weight: 0 })).toThrow('nutrition_invalid_weight')
    expect(() => calculateBMR({ ...maleStats, weight: -10 })).toThrow('nutrition_invalid_weight')
    expect(() => calculateBMR({ ...maleStats, weight: NaN })).toThrow('nutrition_invalid_weight')
  })

  it('throws on invalid height', () => {
    expect(() => calculateBMR({ ...maleStats, height: 0 })).toThrow('nutrition_invalid_height')
  })

  it('throws on invalid age', () => {
    expect(() => calculateBMR({ ...maleStats, age: 0 })).toThrow('nutrition_invalid_age')
  })

  it('throws on invalid gender', () => {
    expect(() => calculateBMR({ ...maleStats, gender: 'X' as never })).toThrow('nutrition_invalid_gender')
  })
})

// ── calculateTDEE ──────────────────────────────────────────────
describe('calculateTDEE', () => {
  const stats: UserStats = { weight: 80, height: 180, age: 30, gender: 'MALE', activityLevel: 'MODERATE' }

  it('equals BMR × activity multiplier', () => {
    const bmr = calculateBMR(stats)
    const tdee = calculateTDEE(stats)
    expect(tdee).toBe(Math.round(bmr * 1.55))
  })

  it('sedentary is less than extra active', () => {
    const sedentary = calculateTDEE({ ...stats, activityLevel: 'SEDENTARY' })
    const extraActive = calculateTDEE({ ...stats, activityLevel: 'EXTRA_ACTIVE' })
    expect(sedentary).toBeLessThan(extraActive)
  })
})

// ── calculateMacros ────────────────────────────────────────────
describe('calculateMacros', () => {
  it('returns all positive values for CUT', () => {
    const macros = calculateMacros(2500, 'CUT')
    expect(macros.protein).toBeGreaterThan(0)
    expect(macros.carbs).toBeGreaterThan(0)
    expect(macros.fat).toBeGreaterThan(0)
  })

  it('returns all positive values for MAINTAIN', () => {
    const macros = calculateMacros(2500, 'MAINTAIN')
    expect(macros.protein).toBeGreaterThan(0)
    expect(macros.carbs).toBeGreaterThan(0)
    expect(macros.fat).toBeGreaterThan(0)
  })

  it('returns all positive values for BULK', () => {
    const macros = calculateMacros(2500, 'BULK')
    expect(macros.protein).toBeGreaterThan(0)
    expect(macros.carbs).toBeGreaterThan(0)
    expect(macros.fat).toBeGreaterThan(0)
  })

  it('CUT protein > BULK protein (higher protein ratio on cut)', () => {
    const cut = calculateMacros(2500, 'CUT')
    const bulk = calculateMacros(2500, 'BULK')
    expect(cut.protein).toBeGreaterThan(bulk.protein)
  })

  it('BULK carbs > CUT carbs (higher carb ratio on bulk)', () => {
    const cut = calculateMacros(2500, 'CUT')
    const bulk = calculateMacros(2500, 'BULK')
    expect(bulk.carbs).toBeGreaterThan(cut.carbs)
  })

  it('throws on invalid calories', () => {
    expect(() => calculateMacros(0, 'MAINTAIN')).toThrow('nutrition_invalid_calories')
    expect(() => calculateMacros(-100, 'CUT')).toThrow('nutrition_invalid_calories')
    expect(() => calculateMacros(NaN, 'BULK')).toThrow('nutrition_invalid_calories')
  })

  it('throws on invalid goal', () => {
    expect(() => calculateMacros(2500, 'INVALID' as never)).toThrow('nutrition_invalid_goal')
  })
})

// ── calculateNutritionGoals ────────────────────────────────────
describe('calculateNutritionGoals', () => {
  const stats: UserStats = { weight: 80, height: 180, age: 30, gender: 'MALE', activityLevel: 'MODERATE' }

  it('returns calories + macros', () => {
    const goals = calculateNutritionGoals(stats, 'MAINTAIN')
    expect(goals.calories).toBeGreaterThan(0)
    expect(goals.protein).toBeGreaterThan(0)
    expect(goals.carbs).toBeGreaterThan(0)
    expect(goals.fat).toBeGreaterThan(0)
  })

  it('CUT calories < MAINTAIN calories < BULK calories', () => {
    const cut = calculateNutritionGoals(stats, 'CUT')
    const maintain = calculateNutritionGoals(stats, 'MAINTAIN')
    const bulk = calculateNutritionGoals(stats, 'BULK')
    expect(cut.calories).toBeLessThan(maintain.calories)
    expect(maintain.calories).toBeLessThan(bulk.calories)
  })
})
