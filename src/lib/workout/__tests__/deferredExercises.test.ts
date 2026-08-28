import { describe, it, expect } from 'vitest'
import {
  FINISH_QUESTION_DEFAULT,
  buildFinishQuestion,
  doneCountOfExercise,
  exerciseNameAt,
  exercisesToDefer,
  isExerciseComplete,
  nextPendingExercise,
  pendingDeferred,
  setsCountOfExercise,
} from '../deferredExercises'

/**
 * "Pular — fazer depois" (28/08/2026).
 *
 * O que estes casos protegem é a DECISÃO: para onde o app leva o usuário depois
 * de adiar. Errar aqui não gera erro nenhum na tela — leva o usuário para um
 * card já concluído, ou para outro que ele mesmo acabou de guardar, e a Ilha
 * Dinâmica passa a anunciar o exercício errado (ela lê `currentExerciseIdx`).
 */

const ex = (sets: number, name = 'Ex') => ({ name, sets })

/** Marca as `n` primeiras séries do exercício `exIdx` como concluídas. */
const done = (exIdx: number, n: number): Record<string, unknown> => {
  const out: Record<string, unknown> = {}
  for (let i = 0; i < n; i++) out[`${exIdx}-${i}`] = { done: true }
  return out
}

describe('setsCountOfExercise', () => {
  it('usa o MAIOR entre o cabeçalho e os detalhes — a série extra do dia não existe no `sets`', () => {
    expect(setsCountOfExercise({ sets: 3 })).toBe(3)
    expect(setsCountOfExercise({ sets: 3, setDetails: [{}, {}, {}, {}] })).toBe(4)
    expect(setsCountOfExercise({ sets: '4', set_details: [{}, {}] })).toBe(4)
  })

  it('devolve 0 para lixo', () => {
    expect(setsCountOfExercise(null)).toBe(0)
    expect(setsCountOfExercise('supino')).toBe(0)
    expect(setsCountOfExercise({})).toBe(0)
  })
})

describe('doneCountOfExercise', () => {
  it('conta só as séries DAQUELE exercício', () => {
    const logs = { ...done(0, 2), ...done(1, 3) }
    expect(doneCountOfExercise(logs, 0, 3)).toBe(2)
    expect(doneCountOfExercise(logs, 1, 3)).toBe(3)
  })

  it('ignora log preenchido mas não concluído', () => {
    expect(doneCountOfExercise({ '0-0': { weight: '80', reps: '10' } }, 0, 3)).toBe(0)
  })
})

describe('isExerciseComplete', () => {
  const ctx = (exercises: unknown[], logs: Record<string, unknown>) =>
    ({ exercises, logs, deferred: new Set<number>() })

  it('completo quando todas as séries estão feitas', () => {
    expect(isExerciseComplete(ctx([ex(3)], done(0, 3)), 0)).toBe(true)
    expect(isExerciseComplete(ctx([ex(3)], done(0, 2)), 0)).toBe(false)
  })

  it('exercício SEM série não conta como completo', () => {
    // Ele não tem o que fazer, mas também não foi feito. Tratá-lo como
    // concluído faria o "próximo pendente" pular por cima de um card que o
    // usuário ainda vê aberto na tela.
    expect(isExerciseComplete(ctx([ex(0)], {}), 0)).toBe(false)
  })
})

describe('nextPendingExercise', () => {
  it('vai para o próximo exercício ainda não feito', () => {
    const ctx = { exercises: [ex(3), ex(3), ex(3)], logs: {}, deferred: new Set<number>() }
    expect(nextPendingExercise(ctx, 0)).toBe(1)
  })

  it('PULA o que já está concluído', () => {
    const ctx = { exercises: [ex(3), ex(3), ex(3)], logs: done(1, 3), deferred: new Set<number>() }
    expect(nextPendingExercise(ctx, 0)).toBe(2)
  })

  it('PULA o que está adiado — senão o app devolveria o usuário ao card que ele guardou', () => {
    const ctx = { exercises: [ex(3), ex(3), ex(3)], logs: {}, deferred: new Set([1]) }
    expect(nextPendingExercise(ctx, 0)).toBe(2)
  })

  it('dá a volta na lista: adiar o ÚLTIMO leva ao primeiro que ficou para trás', () => {
    const ctx = { exercises: [ex(3), ex(3), ex(3)], logs: done(1, 3), deferred: new Set([2]) }
    expect(nextPendingExercise(ctx, 2)).toBe(0)
  })

  it('devolve null quando não sobrou nada pendente', () => {
    const todosFeitos = { ...done(0, 3), ...done(1, 3) }
    expect(nextPendingExercise({ exercises: [ex(3), ex(3)], logs: todosFeitos, deferred: new Set() }, 0)).toBeNull()
  })

  it('devolve null quando o que sobra é tudo adiado — o app não escolhe por quem já escolheu', () => {
    const ctx = { exercises: [ex(3), ex(3)], logs: done(0, 3), deferred: new Set([1]) }
    expect(nextPendingExercise(ctx, 0)).toBeNull()
  })

  it('não quebra com lista vazia nem com índice fora da faixa', () => {
    expect(nextPendingExercise({ exercises: [], logs: {}, deferred: new Set() }, 0)).toBeNull()
    const ctx = { exercises: [ex(3), ex(3)], logs: {}, deferred: new Set<number>() }
    expect(nextPendingExercise(ctx, 99)).toBe(0)
    expect(nextPendingExercise(ctx, Number.NaN)).toBe(1)
  })
})

describe('pendingDeferred', () => {
  it('esquece o adiado que acabou sendo FEITO — senão o rodapé cobraria trabalho já entregue', () => {
    const ctx = { exercises: [ex(3), ex(3), ex(3)], logs: done(1, 3), deferred: new Set([1, 2]) }
    expect(pendingDeferred(ctx)).toEqual([2])
  })

  it('sai ordenado e descarta índice fora da lista (exercício removido no meio da sessão)', () => {
    const ctx = { exercises: [ex(3), ex(3)], logs: {}, deferred: new Set([1, 0, 7]) }
    expect(pendingDeferred(ctx)).toEqual([0, 1])
  })
})

describe('exercisesToDefer', () => {
  it('exercício solo adia sozinho', () => {
    expect(exercisesToDefer(2, new Map())).toEqual([2])
    expect(exercisesToDefer(2, null)).toEqual([2])
  })

  it('Bi-Set adia o PAR inteiro — metade de um par não é um método', () => {
    const groups = new Map([
      [0, { members: [0, 1] }],
      [1, { members: [0, 1] }],
    ])
    expect(exercisesToDefer(0, groups)).toEqual([0, 1])
    expect(exercisesToDefer(1, groups)).toEqual([0, 1])
  })
})

describe('exerciseNameAt', () => {
  it('usa o nome do exercício e cai num rótulo posicional quando não há', () => {
    expect(exerciseNameAt([ex(3, 'Rosca direta')], 0)).toBe('Rosca direta')
    expect(exerciseNameAt([{ name: '  ' }], 0)).toBe('Exercício 1')
    expect(exerciseNameAt([], 4)).toBe('Exercício 5')
  })
})

describe('buildFinishQuestion', () => {
  it('sem adiados, a pergunta de sempre', () => {
    expect(buildFinishQuestion([])).toBe(FINISH_QUESTION_DEFAULT)
    expect(buildFinishQuestion(null)).toBe(FINISH_QUESTION_DEFAULT)
  })

  it('avisa com os NOMES — contagem sozinha manda o usuário sair do diálogo para descobrir quais são', () => {
    const q = buildFinishQuestion(['Rosca direta', 'Tríceps corda'])
    expect(q).toContain('2 exercícios')
    expect(q).toContain('Rosca direta')
    expect(q).toContain('Tríceps corda')
    expect(q).toMatch(/Finalizar o treino mesmo assim\?$/)
  })

  it('concorda no singular', () => {
    expect(buildFinishQuestion(['Rosca direta'])).toContain('1 exercício para fazer depois')
  })

  it('ignora nome vazio em vez de anunciar um exercício fantasma', () => {
    expect(buildFinishQuestion(['  ', ''])).toBe(FINISH_QUESTION_DEFAULT)
  })
})
