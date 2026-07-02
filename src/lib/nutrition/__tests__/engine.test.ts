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
      // Mifflin-St Jeor: 10*80 + 6.25*180 - 5*30 + 5 = 800 + 1125 - 150 + 5 = 1780
      expect(calculateBMR(stats)).toBe(1780)
    })

    it('should calculate correct BMR for a female', () => {
      const stats: UserStats = {
        weight: 60,
        height: 165,
        age: 25,
        gender: 'FEMALE',
        activityLevel: 'SEDENTARY',
      }
      // Mifflin-St Jeor: 10*60 + 6.25*165 - 5*25 - 161 = 600 + 1031.25 - 125 - 161 = 1345.25
      expect(calculateBMR(stats)).toBe(1345)
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
