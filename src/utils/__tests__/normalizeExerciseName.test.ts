import { describe, it, expect } from 'vitest'
import { normalizeExerciseName } from '@/utils/normalizeExerciseName'

describe('normalizeExerciseName', () => {
  it('lowercases and trims input', () => {
    expect(normalizeExerciseName('  Supino Reto  ')).toBe('supino reto')
    expect(normalizeExerciseName('AGACHAMENTO')).toBe('agachamento')
  })

  it('strips accents (NFD normalization)', () => {
    expect(normalizeExerciseName('Extensão de Joelho')).toBe('extensao de joelho')
    expect(normalizeExerciseName('Rosca Bíceps')).toBe('rosca biceps')
    expect(normalizeExerciseName('Remada Unilateral')).toBe('remada unilateral')
  })

  it('replaces special characters with spaces', () => {
    expect(normalizeExerciseName('Supino (Halteres)')).toBe('supino halteres')
    expect(normalizeExerciseName('Leg Press 45°')).toBe('leg press 45')
    expect(normalizeExerciseName('A & B')).toBe('a b')
  })

  it('collapses multiple spaces into one', () => {
    expect(normalizeExerciseName('Leg   Press   45')).toBe('leg press 45')
  })

  it('returns empty string for empty input', () => {
    expect(normalizeExerciseName('')).toBe('')
    expect(normalizeExerciseName('   ')).toBe('')
  })

  it('handles numbers in name', () => {
    expect(normalizeExerciseName('Leg Press 45')).toBe('leg press 45')
    expect(normalizeExerciseName('4x12')).toBe('4x12')
  })

  it('handles null/undefined gracefully (via String coercion)', () => {
    // The function does String(input || ''), so null → ''
    expect(normalizeExerciseName(null as unknown as string)).toBe('')
    expect(normalizeExerciseName(undefined as unknown as string)).toBe('')
  })
})
