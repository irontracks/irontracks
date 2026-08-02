import { describe, it, expect } from 'vitest'
import { pickExerciseLogSlice, shallowEqualByRef } from '../exerciseLogSlice'

/**
 * Prova o mecanismo do fix de re-render do ExerciseCard: editar as séries de UM exercício
 * só troca a referência do slice DAQUELE exercício; os slices dos outros continuam iguais
 * por referência (=> React.memo pula o re-render dos cards não editados).
 */
describe('exerciseLogSlice — slice estável por exercício', () => {
  it('pickExerciseLogSlice pega só as chaves do próprio exIdx (sem casar prefixo parcial)', () => {
    const A = { weight: 10 }, B = { weight: 20 }, C = { weight: 30 }
    const logs = { '1-0': A, '1-1': B, '10-0': C }
    const s1 = pickExerciseLogSlice(logs, 1)
    expect(Object.keys(s1).sort()).toEqual(['1-0', '1-1']) // NÃO inclui "10-0"
    expect(s1['1-0']).toBe(A)
  })

  it('editar exercício 1 mantém o slice do exercício 0 idêntico por referência', () => {
    const A = { weight: 10 }, B = { weight: 20 }, C = { weight: 30 }
    const logs1 = { '0-0': A, '0-1': B, '1-0': C }
    const slice0_before = pickExerciseLogSlice(logs1, 0)
    const slice1_before = pickExerciseLogSlice(logs1, 1)

    // update imutável de uma série do exercício 1 (igual ao controller: spread preserva o resto)
    const C2 = { weight: 35 }
    const logs2 = { ...logs1, '1-0': C2 }

    const slice0_after = pickExerciseLogSlice(logs2, 0)
    const slice1_after = pickExerciseLogSlice(logs2, 1)

    // exercício 0 não mudou -> reusável (shallowEqualByRef true)
    expect(shallowEqualByRef(slice0_before, slice0_after)).toBe(true)
    // exercício 1 mudou -> NÃO reusável (força re-render só desse card)
    expect(shallowEqualByRef(slice1_before, slice1_after)).toBe(false)
  })

  it('shallowEqualByRef detecta add/remove de série (mudança de chaves)', () => {
    const A = { weight: 10 }
    expect(shallowEqualByRef({ '0-0': A }, { '0-0': A })).toBe(true)
    expect(shallowEqualByRef({ '0-0': A }, { '0-0': A, '0-1': A })).toBe(false)
  })
})
