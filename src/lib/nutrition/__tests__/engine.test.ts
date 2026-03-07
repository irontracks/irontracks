import { describe, it, expect } from 'vitest'
import { calculateBMR, calculateMacros, UserStats } from '../engine'

describe('Nutrition Engine', () => {
  describe('calculateBMR', () => {
    it('should calculate correct BMR for a male', () => {
      const stats: UserStats = {
        weight: 80,
        height: 180,
        age: 30,
        gender: 'MALE',
        activityLevel: 'MODERATE',
      }
      // 88.362 + 13.397*80 + 4.799*180 - 5.677*30
      // 88.362 + 1071.76 + 863.82 - 170.31 = 1853.632 -> 1854
      expect(calculateBMR(stats)).toBe(1854)
    })

    it('should calculate correct BMR for a female', () => {
      const stats: UserStats = {
        weight: 60,
        height: 165,
        age: 25,
        gender: 'FEMALE',
        activityLevel: 'SEDENTARY',
      }
      // 447.593 + 9.247*60 + 3.098*165 - 4.33*25
      // 447.593 + 554.82 + 511.17 - 108.25 = 1405.333 -> 1405
      expect(calculateBMR(stats)).toBe(1405)
    })

    it('should throw error for invalid inputs', () => {
      const stats: UserStats = {
        weight: -1,
        height: 180,
        age: 30,
        gender: 'MALE',
        activityLevel: 'MODERATE',
      }
      expect(() => calculateBMR(stats)).toThrow('nutrition_invalid_weight')
    })
  })

  describe('calculateMacros', () => {
    it('should calculate correct macros for CUT', () => {
      const bmr = 2000
      const macros = calculateMacros(bmr, 'CUT')
      
      // Target: 2000 * 0.85 = 1700
      // Protein: 1700 * 0.35 / 4 = 148.75 -> 149
      // Fat: 1700 * 0.25 / 9 = 47.22 -> 47
      // Remaining: 1700 - 149*4 - 47*9 = 1700 - 596 - 423 = 681
      // Carbs: 681 / 4 = 170.25 -> 170
      
      expect(macros.protein).toBe(149)
      expect(macros.fat).toBe(47)
      expect(macros.carbs).toBe(170)
    })

    it('should calculate correct macros for BULK', () => {
      const bmr = 2000
      const macros = calculateMacros(bmr, 'BULK')
      
      // Target: 2000 * 1.1 = 2200
      // Protein: 2200 * 0.25 / 4 = 137.5 -> 138
      // Fat: 2200 * 0.25 / 9 = 61.11 -> 61
      // Remaining: 2200 - 138*4 - 61*9 = 2200 - 552 - 549 = 1099
      // Carbs: 1099 / 4 = 274.75 -> 275

      expect(macros.protein).toBe(138)
      expect(macros.fat).toBe(61)
      expect(macros.carbs).toBe(275)
    })
  })
})
