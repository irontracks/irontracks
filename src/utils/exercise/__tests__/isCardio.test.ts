import { describe, it, expect } from 'vitest'
import { isCardioExercise } from '@/utils/exercise/isCardio'
import { isCardioExercise as fromPacing } from '@/utils/pacing'
import { isCardioExercise as fromCardioKcal } from '@/utils/calories/cardioKcal'

describe('isCardioExercise — fonte única', () => {
  it('type/method === cardio é o sinal confiável', () => {
    expect(isCardioExercise({ type: 'cardio' })).toBe(true)
    expect(isCardioExercise({ method: 'CARDIO' })).toBe(true)
    expect(isCardioExercise({ type: 'strength', name: 'Supino' })).toBe(false)
  })

  it('cobre os 7 tipos do editor pelo nome (fallback sem type)', () => {
    for (const name of ['Escada', 'Esteira', 'Bicicleta', 'Bike Outdoor', 'Corrida', 'Caminhada', 'Elíptico']) {
      expect(isCardioExercise({ name })).toBe(true)
    }
  })

  it('cobre também os termos que o pacing já reconhecia (run/bike)', () => {
    expect(isCardioExercise({ name: 'Morning run' })).toBe(true)
    expect(isCardioExercise({ name: 'Air bike' })).toBe(true)
  })

  it('musculação não é cardio', () => {
    expect(isCardioExercise({ name: 'Agachamento' })).toBe(false)
    expect(isCardioExercise({ name: 'Rosca direta' })).toBe(false)
    expect(isCardioExercise(null)).toBe(false)
  })

  it('pacing e cardioKcal re-exportam a MESMA função (sem divergência)', () => {
    expect(fromPacing).toBe(isCardioExercise)
    expect(fromCardioKcal).toBe(isCardioExercise)
  })
})
