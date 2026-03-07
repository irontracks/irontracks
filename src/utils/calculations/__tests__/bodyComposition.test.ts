import { describe, it, expect } from 'vitest'
import { calculateBMI, classifyBMI, calculateBodyFatPercentage, calculateBodyDensity } from '../bodyComposition'

describe('Body Composition Calculations', () => {
  describe('calculateBMI', () => {
    it('should calculate BMI correctly', () => {
      // 80kg / 1.80m^2 = 80 / 3.24 = 24.69
      const bmi = calculateBMI(80, 180)
      expect(bmi).toBeCloseTo(24.69, 2)
    })

    it('should throw error for invalid input', () => {
      expect(() => calculateBMI(0, 180)).toThrow('Peso e altura devem ser maiores que zero')
      expect(() => calculateBMI(80, 0)).toThrow('Peso e altura devem ser maiores que zero')
    })

    it('should cap extreme values', () => {
      // 200kg / 1.5m^2 = 88.88 -> should be capped at 60
      expect(calculateBMI(200, 150)).toBe(60)
      
      // 30kg / 2m^2 = 7.5 -> should be capped at 10
      expect(calculateBMI(30, 200)).toBe(10)
    })
  })

  describe('classifyBMI', () => {
    it('should classify BMI ranges correctly', () => {
      expect(classifyBMI(18.4)).toBe('Abaixo do peso')
      expect(classifyBMI(24.9)).toBe('Peso normal')
      expect(classifyBMI(29.9)).toBe('Sobrepeso')
      expect(classifyBMI(34.9)).toBe('Obesidade grau I')
      expect(classifyBMI(39.9)).toBe('Obesidade grau II')
      expect(classifyBMI(40.1)).toBe('Obesidade grau III')
    })
  })

  describe('calculateBodyDensity', () => {
    it('should calculate density for male', () => {
      // sum7Skinfolds = 100, age = 30, gender = 'M'
      // 1.112 - (0.00043499 * 100) + (0.00000055 * 100^2) - (0.00028826 * 30)
      // 1.112 - 0.043499 + 0.0055 - 0.0086478
      // 1.0653532
      const density = calculateBodyDensity(100, 30, 'M')
      expect(density).toBeCloseTo(1.0653532, 5)
    })

    it('should calculate density for female', () => {
      // sum7Skinfolds = 100, age = 30, gender = 'F'
      // 1.097 - (0.00046971 * 100) + (0.00000056 * 100^2) - (0.00012828 * 30)
      // 1.097 - 0.046971 + 0.0056 - 0.0038484
      // 1.0517806
      const density = calculateBodyDensity(100, 30, 'F')
      expect(density).toBeCloseTo(1.0517806, 5)
    })
  })

  describe('calculateBodyFatPercentage', () => {
    it('should calculate body fat from density', () => {
      // Siri: (495 / density) - 450
      // density = 1.05
      // 495 / 1.05 = 471.42857...
      // 471.42857 - 450 = 21.42857
      const fat = calculateBodyFatPercentage(1.05)
      expect(fat).toBeCloseTo(21.429, 3)
    })
  })
})
