import { describe, it, expect } from 'vitest'
import { parseWorkoutDay, isWorkoutToday } from '@/utils/workout/workoutDay'

describe('parseWorkoutDay', () => {
  it('lê abreviações no formato do app ("SEG · LOWER B")', () => {
    expect(parseWorkoutDay('SEG · LOWER B - POSTERIOR + GLÚTEO')).toBe(1)
    expect(parseWorkoutDay('TER · UPPER A — COSTAS + OMBRO')).toBe(2)
    expect(parseWorkoutDay('QUA · PUMP - OMBROS + BRAÇOS')).toBe(3)
    expect(parseWorkoutDay('QUI · LOWER A — QUADRÍCEPS')).toBe(4)
  })

  it('aceita nomes completos e acentos', () => {
    expect(parseWorkoutDay('Segunda-feira')).toBe(1)
    expect(parseWorkoutDay('SÁB - Full body')).toBe(6)
    expect(parseWorkoutDay('domingo leve')).toBe(0)
    expect(parseWorkoutDay('Terça · Push')).toBe(2)
    expect(parseWorkoutDay('SEX')).toBe(5)
  })

  it('sem prefixo de dia → null', () => {
    expect(parseWorkoutDay('Treino A')).toBeNull()
    expect(parseWorkoutDay('Push day')).toBeNull()
    expect(parseWorkoutDay('')).toBeNull()
    expect(parseWorkoutDay(null)).toBeNull()
    expect(parseWorkoutDay(undefined)).toBeNull()
  })

  it('não confunde palavras que apenas começam parecido', () => {
    // "TREINO" começa com "TRE" — não é "TER"
    expect(parseWorkoutDay('Treino de força')).toBeNull()
  })
})

describe('isWorkoutToday', () => {
  // 2026-07-13 é uma segunda-feira (getDay() === 1)
  const segunda = new Date(2026, 6, 13, 10, 0, 0)
  const quarta = new Date(2026, 6, 15, 10, 0, 0)

  it('marca hoje quando o dia do título bate com o dia atual', () => {
    expect(isWorkoutToday('SEG · LOWER B', segunda)).toBe(true)
    expect(isWorkoutToday('QUA · PUMP', quarta)).toBe(true)
  })

  it('não marca quando o dia é diferente', () => {
    expect(isWorkoutToday('TER · UPPER A', segunda)).toBe(false)
    expect(isWorkoutToday('SEG · LOWER B', quarta)).toBe(false)
  })

  it('título sem dia nunca é hoje', () => {
    expect(isWorkoutToday('Treino A', segunda)).toBe(false)
  })
})
