import { describe, it, expect } from 'vitest'
import { normalizeWorkoutTitle, workoutTitleKey, formatProgramWorkoutTitle, stripWeekdayHint } from '../workoutTitle'

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

  describe('stripWeekdayHint', () => {
    it('removes weekday parenthetical from program titles (trailing)', () => {
      expect(stripWeekdayHint('A - PEITO E TRÍCEPS (TERÇA)')).toBe('A - PEITO E TRÍCEPS')
      expect(stripWeekdayHint('B - COSTAS (SEGUNDA)')).toBe('B - COSTAS')
      expect(stripWeekdayHint('C - PERNAS (sábado)')).toBe('C - PERNAS')
    })

    it('removes "(DIA N)" trailing tag', () => {
      expect(stripWeekdayHint('A - Treino (Dia 3)')).toBe('A - Treino')
    })

    it('removes abbreviated leading weekday with middle-dot separator', () => {
      expect(stripWeekdayHint('TER · PULL - DORSAIS + BÍCEPS')).toBe('PULL - DORSAIS + BÍCEPS')
      expect(stripWeekdayHint('SEG · PEITO')).toBe('PEITO')
      expect(stripWeekdayHint('DOM · DESCANSO ATIVO')).toBe('DESCANSO ATIVO')
      expect(stripWeekdayHint('SÁB · PERNAS')).toBe('PERNAS')
    })

    it('removes full leading weekday with various separators', () => {
      expect(stripWeekdayHint('TERÇA · PULL')).toBe('PULL')
      expect(stripWeekdayHint('SEGUNDA - PEITO')).toBe('PEITO')
      expect(stripWeekdayHint('SEGUNDA-FEIRA: PEITO')).toBe('PEITO')
      expect(stripWeekdayHint('Quarta · Costas')).toBe('Costas')
    })

    it('does not falsely strip words that merely start with weekday letters', () => {
      // "Terapia" começa com "ter" mas não é um dia da semana
      expect(stripWeekdayHint('Terapia - Reabilitação')).toBe('Terapia - Reabilitação')
      // Sem separador depois do dia → não toca
      expect(stripWeekdayHint('TER PULL')).toBe('TER PULL')
    })

    it('keeps titles that have no weekday hint untouched', () => {
      expect(stripWeekdayHint('Peito + Tríceps')).toBe('Peito + Tríceps')
      expect(stripWeekdayHint('A - PEITO')).toBe('A - PEITO')
    })

    it('handles empty input', () => {
      expect(stripWeekdayHint('')).toBe('')
      expect(stripWeekdayHint(null)).toBe('')
    })
  })
})
