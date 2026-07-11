import { describe, it, expect } from 'vitest'
import { applyExerciseOrder, buildExerciseDraft, moveDraftItem } from '../workoutReorder'

describe('workoutReorder', () => {
  it('reorders exercises by draft order', () => {
    const exercises = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }]
    const draft = buildExerciseDraft(exercises)
    const nextDraft = [draft[2], draft[0], draft[1]]
    const result = applyExerciseOrder(exercises, nextDraft)
    expect(result.map((ex) => ex.id)).toEqual(['c', 'a', 'b'])
  })

  it('keeps missing draft items at the end', () => {
    const exercises = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }]
    const draft = buildExerciseDraft(exercises)
    const partialDraft = [draft[2]]
    const result = applyExerciseOrder(exercises, partialDraft)
    expect(result.map((ex) => ex.id)).toEqual(['c', 'a', 'b'])
  })

  it('moves draft item with helper', () => {
    const exercises = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }]
    const draft = buildExerciseDraft(exercises)
    const moved = moveDraftItem(draft, 0, 2)
    expect(moved.map((it) => it.exercise.id)).toEqual(['b', 'c', 'a'])
  })

  // Regressão: o botão "Duplicar" do editor faz spread raso ({ ...ex }), copiando o
  // `id`. Antes, applyExerciseOrder colapsava exercícios com o mesmo id (Map por
  // chave + Set 'used') e DROPAVA um deles — perda de exercício + logs fantasma no
  // card errado, persistida no plano. Reorder tem que preservar TODOS por posição.
  describe('exercícios com id duplicado (ex.: após "Duplicar")', () => {
    it('não dropa nenhum exercício ao reordenar (preserva a contagem)', () => {
      const exercises = [
        { id: 's', name: 'Supino' },
        { id: 'a', name: 'Agachamento' },
        { id: 's', name: 'Supino' },
      ]
      const draft = buildExerciseDraft(exercises)
      // inverte a ordem
      const result = applyExerciseOrder(exercises, [draft[2], draft[1], draft[0]])
      expect(result).toHaveLength(3)
      expect(result.map((ex) => ex.name)).toEqual(['Supino', 'Agachamento', 'Supino'])
    })

    it('mantém referências de objeto distintas (o remap de logs por indexOf funciona)', () => {
      const dup = { id: 's', name: 'Supino' }
      const copy = { id: 's', name: 'Supino' } // referência distinta, mesmo id
      const exercises = [dup, { id: 'a', name: 'Agachamento' }, copy]
      const draft = buildExerciseDraft(exercises)
      const result = applyExerciseOrder(exercises, [draft[1], draft[0], draft[2]])
      // as duas ocorrências continuam presentes como objetos distintos
      expect(result.filter((ex) => ex === dup)).toHaveLength(1)
      expect(result.filter((ex) => ex === copy)).toHaveLength(1)
      // e indexOf de cada uma é único (base do remapeamento de logs em saveOrganize)
      expect(result.indexOf(dup)).not.toBe(result.indexOf(copy))
    })
  })
})
