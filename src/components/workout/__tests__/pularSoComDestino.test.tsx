import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { nextPendingExercise } from '@/lib/workout/deferredExercises'

/**
 * "Pular — fazer depois" só aparece quando existe PARA ONDE ir.
 *
 * Relato do dono (02/09/2026): no último exercício, com todos os outros
 * concluídos, o botão continuava lá. O controller já tratava o caso ficando
 * parado (`nextPendingExercise` devolve null), mas o botão seguia oferecendo a
 * ação — e o único efeito visível era recolher o card que ele estava fazendo.
 */
/**
 * Reproduz o que o card calcula: adiar ESTE exercício e então procurar destino.
 * Sem marcar o próprio índice, a busca dá a volta na lista e devolve ele mesmo.
 */
const destinoAoAdiar = (total: number, feitos: number[], atual: number, adiados: number[] = []) => {
  const deferred = new Set<number>([...adiados, atual])
  return nextPendingExercise({
    exercises: Array.from({ length: total }, () => ({ sets: 1 })) as unknown[],
    logs: Object.fromEntries(feitos.map((i) => [`${i}-0`, { done: true }])) as Record<string, unknown>,
    deferred,
  }, atual)
}

describe('destino do "fazer depois"', () => {
  it('no último pendente não há destino — o botão não deve aparecer', () => {
    // 8 exercícios, os sete primeiros concluídos, o usuário está no oitavo.
    expect(destinoAoAdiar(8, [0, 1, 2, 3, 4, 5, 6], 7)).toBeNull()
  })

  it('havendo outro pendente, há destino', () => {
    expect(destinoAoAdiar(8, [0, 1, 2, 3, 4, 5], 7)).toBe(6)
  })

  it('exercício ADIADO não conta como destino — senão o app manda para o que foi mandado embora', () => {
    expect(destinoAoAdiar(8, [0, 1, 2, 3, 4, 5], 7, [6])).toBeNull()
  })

  it('único exercício do treino: nunca há destino', () => {
    expect(destinoAoAdiar(1, [], 0)).toBeNull()
  })
})

describe('fiação — o card consulta o destino antes de oferecer o botão', () => {
  const src = readFileSync('src/components/workout/ExerciseCard.tsx', 'utf8')

  it('canDefer exige temDestinoAoAdiar', () => {
    const linha = src.split('\n').find((l) => l.includes('const canDefer'))
    expect(linha, 'a linha do canDefer precisa existir — se sumiu, o guard perdeu o alvo').toBeTruthy()
    expect(linha).toMatch(/temDestinoAoAdiar/)
  })

  it('o wrapper calcula o destino com os logs de TODOS, não com a fatia do card', () => {
    const i = src.indexOf('function ExerciseCard(')
    const corpo = src.slice(i)
    expect(corpo).not.toBe('')
    expect(corpo).toMatch(/nextPendingExercise\(/)
    // A fatia do card (logsSlice) não serve: ela só tem as séries deste exercício.
    expect(corpo).toMatch(/logs: logs as Record<string, unknown>/)
    // E precisa simular o adiamento, senão a busca devolve o próprio exercício.
    expect(corpo).toMatch(/deferred\.add\(exIdx\)/)
  })
})

describe('fiação — o header fica acima da lista que rola', () => {
  it('o menu "…" não pode ficar por baixo dos botões do exercício', () => {
    const src = readFileSync('src/components/workout/WorkoutHeader.tsx', 'utf8')
    const i = src.indexOf('backdrop-blur-xl border-b')
    expect(i, 'a classe do contêiner do header precisa existir').toBeGreaterThan(-1)
    const linha = src.slice(i, src.indexOf('\n', i))
    // Sem z próprio, qualquer elemento posicionado da lista pinta por cima —
    // o `z-10` interno do dropdown só compete dentro do header.
    expect(linha).toMatch(/\bz-30\b/)
  })
})
