import { render, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'

/**
 * RETOMAR um treino não é CONCLUIR uma série.
 *
 * O defeito (achado pela varredura de classe de 10/09/2026, mesma forma do
 * `wizard_abandoned`): `prevDoneKeysRef` nascia `new Set()`, então na primeira
 * passagem do efeito com sessão restaurada as N séries já feitas apareciam
 * contra zero anteriores — e a PRIMEIRA delas era lida como recém-concluída.
 *
 * O efeito disso no aparelho: o app trocava o exercício atual e rolava a tela
 * sozinho ao voltar para um treino em andamento; num Bi-Set, ainda expandia o
 * grupo e fazia `scrollIntoView` 250 ms depois, vencendo o `scrollToTop`.
 * Iniciar treino novo era inofensivo (logs vazios) — o defeito era do RETOMAR,
 * que é o caminho comum (sair e voltar, ou relançar com sessão salva).
 *
 * ⚠️ Semear a baseline só no mount NÃO basta, e é por isso que há dois portões:
 * os logs podem chegar DEPOIS do mount (hidratação do sync, eco do Realtime).
 * O segundo portão é "conclusão é UMA série por toque".
 */

vi.mock('../ExerciseCard', () => ({ default: () => null }))
vi.mock('../SessionDeloadBanner', () => ({ default: () => null }))
vi.mock('@/components/TeamProgressPanel', () => ({ TeamProgressPanel: () => null }))

const PADRAO = [
  { id: 'a', name: 'Supino reto', sets: 1 },
  { id: 'b', name: 'Rosca direta', sets: 1 },
  { id: 'c', name: 'Tríceps corda', sets: 1 },
]
let exercisesRef: Array<Record<string, unknown>> = PADRAO
let collapsedRef = new Set<number>()
const setCollapsed = vi.fn()

let logs: Record<string, Record<string, unknown>> = {}
let deferred = new Set<number>()
const focusExercise = vi.fn()

const ctx = {
  get exercises() { return exercisesRef },
  get deferredExercises() { return deferred },
  focusExercise,
  session: { id: 's1' },
  get collapsed() { return collapsedRef },
  setCollapsed,
}
vi.mock('../WorkoutContext', () => ({
  useWorkoutContext: () => ctx,
  useWorkoutLogs: () => logs,
}))

import ExerciseList from '../ExerciseList'

beforeEach(() => {
  logs = {}
  deferred = new Set<number>()
  exercisesRef = PADRAO
  collapsedRef = new Set<number>()
  focusExercise.mockClear()
  setCollapsed.mockClear()
})
afterEach(() => cleanup())

describe('retomar um treino em andamento não mexe na tela', () => {
  it('montar com séries JÁ concluídas não dispara o foco automático', () => {
    // Cenário real: o usuário guardou o exercício 1, fez os outros dois e saiu.
    // Ao voltar, nada foi concluído AGORA — ninguém tocou em nada.
    deferred = new Set([1])
    logs = { '0-0': { done: true }, '2-0': { done: true } }

    render(<ExerciseList />)

    expect(
      focusExercise,
      'a tela saltou ao retomar — é o defeito do retomar',
    ).not.toHaveBeenCalled()
  })

  it('Bi-Set restaurado no meio não expande nem rola sozinho', () => {
    // ⚠️ Este caso existe por causa de uma MUTAÇÃO que passou verde duas vezes.
    // Com duas séries restauradas, o segundo portão ("uma por toque") segura
    // sozinho; e com uma série só, o ramo do exercício guardado nem é alcançado
    // (ainda há pendente). O único caminho que separa os dois portões é o do
    // GRUPO, que dispara com UMA série — e é o que prova a baseline sozinha.
    const parA = { id: 'x', name: 'Supino', sets: 2, method: 'Bi-Set' }
    const parB = { id: 'y', name: 'Remada', sets: 2, method: 'Bi-Set' }
    exercisesRef = [parA, parB]
    collapsedRef = new Set([1])
    logs = { '0-0': { done: true } }   // metade do Bi-Set feita antes de sair

    render(<ExerciseList />)

    expect(
      setCollapsed,
      'o grupo foi expandido ao RETOMAR — a baseline não está protegendo',
    ).not.toHaveBeenCalled()
  })

  it('logs que chegam DEPOIS do mount (sync/Realtime) também não disparam', () => {
    // Segundo portão: montou vazio e a sessão hidratou em seguida.
    deferred = new Set([1])
    const { rerender } = render(<ExerciseList />)

    logs = { '0-0': { done: true }, '2-0': { done: true } }
    rerender(<ExerciseList />)

    expect(focusExercise, 'hidratação tardia foi lida como conclusão').not.toHaveBeenCalled()
  })

  it('mas concluir UMA série de verdade continua levando ao guardado', () => {
    // O comportamento que o efeito existe para produzir não pode ser perdido
    // junto com o ruído.
    deferred = new Set([1])
    logs = { '0-0': { done: true } }
    const { rerender } = render(<ExerciseList />)
    expect(focusExercise).not.toHaveBeenCalled()

    logs = { ...logs, '2-0': { done: true } }
    rerender(<ExerciseList />)

    expect(focusExercise, 'a volta ao exercício guardado deixou de funcionar').toHaveBeenCalledWith(1)
  })
})
