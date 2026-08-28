import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'

/**
 * A tira de navegação — o que só se vê montando.
 *
 * A decisão de cor/estado tem casos próprios em `lib/workout/exerciseRail`.
 * Aqui ficam as três coisas que aquele módulo não alcança: a tira SUMIR em
 * treino curto, o toque levar ao exercício certo, e o alvo ter 44px de verdade
 * (numa fileira horizontal, `.tap-44` invadiria o card de baixo).
 */

let exercises: unknown[] = []
let logs: Record<string, unknown> = {}
let deferred = new Set<number>()
let currentExerciseIdx = 0
const focusExercise = vi.fn()

const ctx = {
    get exercises() { return exercises },
    get deferredExercises() { return deferred },
    get currentExerciseIdx() { return currentExerciseIdx },
    focusExercise,
}
vi.mock('../WorkoutContext', () => ({
    useWorkoutContext: () => ctx,
    useWorkoutLogs: () => logs,
}))

import WorkoutExerciseRail from '../WorkoutExerciseRail'

const treinoDe = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ name: `Exercício ${i + 1}`, sets: 3 }))

beforeEach(() => {
    exercises = treinoDe(6)
    logs = {}
    deferred = new Set<number>()
    currentExerciseIdx = 0
    focusExercise.mockClear()
})
afterEach(() => cleanup())

describe('WorkoutExerciseRail', () => {
    it('mostra um chip por exercício', () => {
        render(<WorkoutExerciseRail />)
        expect(screen.getAllByRole('button')).toHaveLength(6)
        expect(screen.getByText('01')).toBeTruthy()
        expect(screen.getByText('06')).toBeTruthy()
    })

    it('SOME em treino curto — a faixa não vale o topo da tela para encurtar rolagem curta', () => {
        exercises = treinoDe(3)
        const { container } = render(<WorkoutExerciseRail />)
        expect(container.firstChild).toBeNull()
    })

    it('o toque leva ao exercício — e é o MESMO caminho que o "fazer depois" usa', () => {
        render(<WorkoutExerciseRail />)
        fireEvent.click(screen.getByRole('button', { name: /Ir para Exercício 4/i }))
        expect(focusExercise).toHaveBeenCalledWith(3)
    })

    it('anuncia estado e progresso — número sozinho é ilegível no leitor de tela', () => {
        logs = { '1-0': { done: true } }
        deferred = new Set([2])
        render(<WorkoutExerciseRail />)
        expect(screen.getByRole('button', { name: /Exercício 2, 1 de 3 séries/i })).toBeTruthy()
        expect(screen.getByRole('button', { name: /Exercício 3.*guardado para depois/i })).toBeTruthy()
    })

    it('marca o atual com aria-current, para o leitor de tela dizer onde se está', () => {
        currentExerciseIdx = 2
        render(<WorkoutExerciseRail />)
        const atual = screen.getByRole('button', { name: /Ir para Exercício 3/i })
        expect(atual.getAttribute('aria-current')).toBe('true')
    })

    it('o alvo tem 44px REAIS — `.tap-44` numa fileira roubaria o toque do card de baixo', () => {
        render(<WorkoutExerciseRail />)
        for (const b of screen.getAllByRole('button')) {
            expect(b.className).toMatch(/\bh-11\b/)
            expect(b.className).toMatch(/\bmin-w-11\b/)
            expect(b.className, 'tap-44 estende a área para fora da tira').not.toMatch(/tap-44/)
        }
    })
})
