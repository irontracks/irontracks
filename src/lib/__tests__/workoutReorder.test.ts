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
})
