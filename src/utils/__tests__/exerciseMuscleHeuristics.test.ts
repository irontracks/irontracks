import { describe, it, expect } from 'vitest'
import { buildHeuristicExerciseMap } from '@/utils/exerciseMuscleHeuristics'

describe('buildHeuristicExerciseMap', () => {
  it('returns null for empty input', () => {
    expect(buildHeuristicExerciseMap('')).toBeNull()
    expect(buildHeuristicExerciseMap('   ')).toBeNull()
  })

  it('detects Supino Reto as chest exercise', () => {
    const result = buildHeuristicExerciseMap('Supino Reto')
    expect(result).not.toBeNull()
    expect(result?.mapping.contributions[0].muscleId).toBe('chest')
    expect(result?.source).toBe('heuristic')
  })

  it('detects Agachamento Livre as quads exercise', () => {
    const result = buildHeuristicExerciseMap('Agachamento Livre')
    expect(result).not.toBeNull()
    expect(result?.mapping.contributions[0].muscleId).toBe('quads')
    expect(result?.source).toBe('heuristic')
  })

  it('detects calf exercises by keyword', () => {
    const result = buildHeuristicExerciseMap('Elevação de Panturrilha')
    expect(result).not.toBeNull()
    expect(result?.mapping.contributions[0].muscleId).toBe('calves')
    expect(result?.mapping.contributions[0].role).toBe('primary')
    expect(result?.source).toBe('heuristic')
    expect(result?.confidence).toBeGreaterThanOrEqual(0.8)
  })

  it('detects calf by English keyword "calf"', () => {
    const result = buildHeuristicExerciseMap('Standing Calf Raise')
    expect(result).not.toBeNull()
    expect(result?.mapping.contributions[0].muscleId).toBe('calves')
  })

  it('detects soleus / gastrocnemius variations', () => {
    expect(buildHeuristicExerciseMap('Sóleo Sentado')).not.toBeNull()
    expect(buildHeuristicExerciseMap('Gastrocnêmio')).not.toBeNull()
  })

  it('detects gemeo / gemeos variations', () => {
    expect(buildHeuristicExerciseMap('Gêmeo em Pé')).not.toBeNull()
  })

  it('sets exercise_key from normalized name', () => {
    const result = buildHeuristicExerciseMap('Panturrilha no Smith')
    expect(result?.exercise_key).toBe('panturrilha no smith')
    expect(result?.canonical_name).toBe('Panturrilha no Smith')
  })

  it('populates all required fields', () => {
    const result = buildHeuristicExerciseMap('Calf Press')
    expect(result).toMatchObject({
      source: 'heuristic',
      mapping: expect.objectContaining({
        contributions: expect.any(Array),
        unilateral: expect.any(Boolean),
        confidence: expect.any(Number),
        notes: expect.any(String),
      }),
    })
  })
})
