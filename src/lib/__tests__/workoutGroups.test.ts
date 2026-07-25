import { describe, it, expect } from 'vitest'
import { buildExerciseGroups } from '../workoutGroups'

/**
 * Guard: pares CONSECUTIVOS do mesmo método são grupos SEPARADOS.
 *
 * INCIDENTE (relato do dono, 2026-07-25): "concluí o 2º exercício do Bi-Set e o
 * descanso não correu". Treino real `ccdb912b` tem 4 Bi-Sets seguidos —
 * Bíceps banco 45º / Tríceps testa / Bíceps corda / Tríceps corda — que são DOIS
 * pares. O run consecutivo virava UM grupo de 4, e como o descanso
 * (groupMethodSet) só roda no ÚLTIMO membro, o 2º exercício (fim do 1º par)
 * ficava sem descanso: só o 4º descansava.
 *
 * INVARIANTE: o run é fatiado pelo tamanho do método (Bi-Set/Super-Set/
 * Pré-/Pós-exaustão = 2, Tri-Set = 3). Giant-Set não tem tamanho fixo (4+),
 * então consome o run inteiro. Sobra menor que o tamanho vira solo.
 */
const ex = (name: string, method: string) => ({ name, method })

describe('buildExerciseGroups — fatiamento por tamanho do método', () => {
  it('4 Bi-Sets consecutivos = DOIS pares, não um grupo de 4', () => {
    const g = buildExerciseGroups([
      ex('Bíceps banco 45º', 'Bi-Set'),
      ex('Tríceps testa', 'Bi-Set'),
      ex('Bíceps corda', 'Bi-Set'),
      ex('Tríceps corda', 'Bi-Set'),
    ])
    expect(g.get(0)).toMatchObject({ members: [0, 1], position: 0, size: 2 })
    expect(g.get(1)).toMatchObject({ members: [0, 1], position: 1, size: 2 })
    expect(g.get(2)).toMatchObject({ members: [2, 3], position: 0, size: 2 })
    expect(g.get(3)).toMatchObject({ members: [2, 3], position: 1, size: 2 })
  })

  it('o 2º exercício é o ÚLTIMO do seu par (é ele que dispara o descanso)', () => {
    const g = buildExerciseGroups([
      ex('A', 'Bi-Set'), ex('B', 'Bi-Set'), ex('C', 'Bi-Set'), ex('D', 'Bi-Set'),
    ])
    const isLast = (i: number) => {
      const info = g.get(i)
      return !info || info.position === info.size - 1
    }
    expect(isLast(0)).toBe(false)
    expect(isLast(1)).toBe(true)  // ← era false antes da correção: bug
    expect(isLast(2)).toBe(false)
    expect(isLast(3)).toBe(true)
  })

  it('par simples (2 Bi-Sets) segue formando um grupo', () => {
    const g = buildExerciseGroups([ex('Panturrilha sentado', 'Bi-Set'), ex('Panturrilha em pé', 'Bi-Set')])
    expect(g.get(0)).toMatchObject({ members: [0, 1], position: 0, size: 2 })
    expect(g.get(1)).toMatchObject({ members: [0, 1], position: 1, size: 2 })
  })

  it('3 Bi-Sets consecutivos: par + sobra solo (o 3º descansa normal)', () => {
    const g = buildExerciseGroups([ex('A', 'Bi-Set'), ex('B', 'Bi-Set'), ex('C', 'Bi-Set')])
    expect(g.get(0)).toMatchObject({ members: [0, 1], size: 2 })
    expect(g.get(1)).toMatchObject({ members: [0, 1], size: 2 })
    expect(g.get(2)).toBeUndefined()
  })

  it('Tri-Set fatia de 3 em 3', () => {
    const g = buildExerciseGroups([
      ex('A', 'Tri-Set'), ex('B', 'Tri-Set'), ex('C', 'Tri-Set'),
      ex('D', 'Tri-Set'), ex('E', 'Tri-Set'), ex('F', 'Tri-Set'),
    ])
    expect(g.get(2)).toMatchObject({ members: [0, 1, 2], position: 2, size: 3 })
    expect(g.get(3)).toMatchObject({ members: [3, 4, 5], position: 0, size: 3 })
  })

  it('Giant-Set não tem tamanho fixo: consome o run inteiro', () => {
    const g = buildExerciseGroups([
      ex('A', 'Giant-Set'), ex('B', 'Giant-Set'), ex('C', 'Giant-Set'),
      ex('D', 'Giant-Set'), ex('E', 'Giant-Set'),
    ])
    expect(g.get(0)).toMatchObject({ members: [0, 1, 2, 3, 4], size: 5 })
  })

  it('Bi-Set isolado (sem par consecutivo) não forma grupo', () => {
    const g = buildExerciseGroups([ex('A', 'Bi-Set'), ex('B', 'Normal')])
    expect(g.get(0)).toBeUndefined()
  })
})
