import { render, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'

/**
 * "Depois" chegou: o app leva o usuário ao exercício que ele guardou.
 *
 * O adiado fica NO LUGAR (decisão do dono, 28/08/2026), e é justamente por isso
 * que ele precisa de um caminho de volta: quem termina o resto do treino não
 * deve sair rolando a lista atrás do card que ele mesmo pulou.
 *
 * O que este arquivo cobre é a FIAÇÃO — a decisão pura ("não sobrou pendente
 * fora dos guardados") já tem casos próprios em lib/workout/deferredExercises.
 * Sem exercitar a lista de verdade, remover a chamada do efeito passaria verde:
 * o helper continuaria certo e ninguém o chamaria.
 */

vi.mock('../ExerciseCard', () => ({ default: () => null }))
vi.mock('../SessionDeloadBanner', () => ({ default: () => null }))
vi.mock('@/components/TeamProgressPanel', () => ({ TeamProgressPanel: () => null }))

const exercises = [
  { id: 'a', name: 'Supino reto', sets: 1 },
  { id: 'b', name: 'Rosca direta', sets: 1 },
  { id: 'c', name: 'Tríceps corda', sets: 1 },
]

let logs: Record<string, Record<string, unknown>> = {}
let deferred = new Set<number>()
const focusExercise = vi.fn()

const ctx = {
  get exercises() { return exercises },
  get deferredExercises() { return deferred },
  focusExercise,
  session: { id: 's1' },
  collapsed: new Set<number>(),
  setCollapsed: vi.fn(),
}
vi.mock('../WorkoutContext', () => ({
  useWorkoutContext: () => ctx,
  useWorkoutLogs: () => logs,
}))

import ExerciseList from '../ExerciseList'

beforeEach(() => {
  logs = {}
  deferred = new Set<number>()
  focusExercise.mockClear()
})
afterEach(() => cleanup())

/** Conclui a série 0 do exercício e re-renderiza — é o ciclo real do app. */
function concluir(exIdx: number, rerender: (ui: React.ReactElement) => void) {
  logs = { ...logs, [`${exIdx}-0`]: { done: true } }
  rerender(<ExerciseList />)
}

describe('volta ao exercício guardado', () => {
  it('ao fechar o último exercício NÃO adiado, leva ao guardado', () => {
    deferred = new Set([1])
    const { rerender } = render(<ExerciseList />)
    concluir(0, rerender)
    expect(focusExercise).not.toHaveBeenCalled() // ainda falta o exercício 2
    concluir(2, rerender)
    expect(focusExercise).toHaveBeenCalledWith(1)
  })

  it('não leva a lugar nenhum enquanto sobrar exercício pendente fora dos guardados', () => {
    deferred = new Set([2])
    const { rerender } = render(<ExerciseList />)
    concluir(0, rerender)
    expect(focusExercise).not.toHaveBeenCalled()
  })

  it('sem nada guardado, o fim do treino não empurra o usuário para lugar nenhum', () => {
    const { rerender } = render(<ExerciseList />)
    concluir(0, rerender)
    concluir(1, rerender)
    concluir(2, rerender)
    expect(focusExercise).not.toHaveBeenCalled()
  })
})
