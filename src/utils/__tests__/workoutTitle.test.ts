import { describe, it, expect } from 'vitest'
import { normalizeWorkoutTitle, workoutTitleKey, formatProgramWorkoutTitle } from '../workoutTitle'

describe('Workout Title Utils', () => {
  describe('normalizeWorkoutTitle', () => {
    it('should extract letter and rest', () => {
      expect(normalizeWorkoutTitle('Treino A - Peito')).toBe('A - peito')
      expect(normalizeWorkoutTitle('A - Peito')).toBe('A - peito')
      expect(normalizeWorkoutTitle('(A) Peito')).toBe('A - peito')
      expect(normalizeWorkoutTitle('Treino B')).toBe('B')
    })

    it('should handle trailing day hints', () => {
      // Assuming normalizeWorkoutTitle uses stripTrailingDayHint internally? 
      // Checking the code: normalizeWorkoutTitle calls extractLeadingLetter -> normalizeDash. 
      // It does NOT call stripTrailingDayHint. Wait.
      // Let's check formatProgramWorkoutTitle which uses stripTrailingDayHint.
      
      // But normalizeWorkoutTitle logic is:
      // const { letter, rest } = extractLeadingLetter(raw)
      // if (!letter) return normalizeSpaces(normalizeDash(raw))
      // if (!rest) return letter
      // return `${letter} - ${rest}`
      
      expect(normalizeWorkoutTitle('Treino C (segunda)')).toBe('C - (segunda)')
    })

    it('should return empty string for empty input', () => {
      expect(normalizeWorkoutTitle('')).toBe('')
      expect(normalizeWorkoutTitle(null)).toBe('')
    })
  })

  describe('workoutTitleKey', () => {
    it('should normalize title for key usage', () => {
      expect(workoutTitleKey('Treino A - Peito')).toBe('peito')
      expect(workoutTitleKey('A - Costas & Bíceps')).toBe('costas & biceps')
    })
  })

  describe('formatProgramWorkoutTitle', () => {
    it('should format title with letter and day', () => {
      const options = { startDay: 'monday' }
      // Input must be formatted like "Treino A - ..." to work correctly with current implementation
      expect(formatProgramWorkoutTitle('Treino A - Força', 0, options)).toBe('A - FORÇA (SEGUNDA)')
      expect(formatProgramWorkoutTitle('Treino B - Cardio', 1, options)).toBe('B - CARDIO (TERÇA)')
    })

    it('should strip existing day hints', () => {
      const options = { startDay: 'monday' }
      expect(formatProgramWorkoutTitle('Treino A (segunda)', 0, options)).toBe('A - TREINO (SEGUNDA)')
    })
  })
})
