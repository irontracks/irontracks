import { describe, it, expect } from 'vitest'
import { exercisesToSkip, dispensadosSemTrabalho } from '../skippedExercises'

/**
 * "Não vou fazer esse hoje" ≠ "fazer depois".
 *
 * O adiar tira do CAMINHO e continua cobrando; a dispensa tira da CONTA. A
 * diferença mora no denominador do progresso — e é ela que este arquivo trava.
 */
const treino = [
    { name: 'Agachamento', sets: 4 },
    { name: 'Leg press', sets: 3 },
    { name: 'Panturrilha sentado', sets: 4 },
]
const feitas = (...chaves: string[]) =>
    Object.fromEntries(chaves.map((k) => [k, { done: true }]))

describe('grupo vai junto, como no adiar', () => {
    it('Bi-Set dispensa os dois membros', () => {
        const grupos = new Map([[0, { members: [0, 1] }], [1, { members: [0, 1] }]])
        expect(exercisesToSkip(0, grupos).sort()).toEqual([0, 1])
    })

    it('exercício solto dispensa só ele', () => {
        expect(exercisesToSkip(2, new Map())).toEqual([2])
        expect(exercisesToSkip(2, null)).toEqual([2])
    })
})

describe('menção no fim é só para quem não fez nada', () => {
    it('lista o dispensado sem nenhuma série', () => {
        const ctx = { exercises: treino, logs: {}, skipped: new Set([2]) }
        expect(dispensadosSemTrabalho(ctx, treino)).toEqual(['Panturrilha sentado'])
    })

    it('quem fez parte e parou NÃO vira cobrança', () => {
        const ctx = { exercises: treino, logs: feitas('2-0'), skipped: new Set([2]) }
        expect(dispensadosSemTrabalho(ctx, treino)).toEqual([])
    })
})
