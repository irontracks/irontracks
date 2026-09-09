import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, cleanup } from '@testing-library/react'

/**
 * O modal rápido "Editar exercício" (lápis do CARD, no treino ativo) precisa
 * oferecer os blocos de cardio.
 *
 * Por que um teste de RENDER e não um source-guard: o guard de fiação em
 * `cardioBlocos.test.ts` exige que o arquivo MONTE o `<CardioBlocosEditor>`, e
 * ele passa verde com a condição trocada por `{false && …}` — medido por
 * mutação em 09/09/2026. O que separa "o componente está no arquivo" de "o
 * usuário alcança o componente" é montar a tela.
 *
 * O caso do dono: ele abriu este modal no meio do treino procurando os blocos
 * (5 min a 4 km/h → 10 a 5 → 15 a 6), não achou e concluiu que era regressão.
 * A feature existia desde o #1063 — só morava na tela que ele não abriu.
 */

const contexto: Record<string, unknown> = {}

vi.mock('../WorkoutContext', () => ({
    useWorkoutContext: () => contexto,
    useWorkoutLogs: () => ({ logs: {} }),
}))
vi.mock('../ModalsSimpleMethods', () => ({ ModalsSimpleMethods: () => null }))
vi.mock('../ModalsComplexMethods', () => ({ ModalsComplexMethods: () => null }))
vi.mock('../CheckinScale', () => ({ CheckinScale: () => null }))

const montar = async (method: string, blocos: unknown[]) => {
    Object.assign(contexto, {
        workout: { exercises: [{ name: 'Esteira', method, sets: blocos.length }] },
        editExerciseOpen: true,
        editExerciseIdx: 0,
        editExerciseDraft: { name: 'Esteira', sets: String(blocos.length), restTime: '60', method, blocos },
        setEditExerciseDraft: vi.fn(),
        setEditExerciseOpen: vi.fn(),
        setEditExerciseIdx: vi.fn(),
        saveEditExercise: vi.fn(),
        editExerciseHasChanges: false,
        persistToPlan: false,
        setPersistToPlan: vi.fn(),
    })
    const Modals = (await import('../Modals')).default
    render(<Modals />)
}

beforeEach(() => {
    cleanup()
    for (const k of Object.keys(contexto)) delete contexto[k]
})

describe('o modal do lápis oferece BLOCOS quando o exercício é cardio', () => {
    it('mostra o editor de blocos e esconde Sets', async () => {
        await montar('Cardio', [{ durationSeconds: 300, advanced_config: { speed: 4 } }])

        expect(screen.getByLabelText('Minutos do bloco 1'), 'o usuário não alcança os blocos').toBeTruthy()
        expect(screen.getByText(/Adicionar bloco/i)).toBeTruthy()
        // "Sets" não existe em cardio: quem manda na contagem é o nº de blocos.
        expect(screen.queryByLabelText?.('Sets') ?? null).toBeNull()
        expect(document.querySelector('#edit-exercise-sets')).toBeNull()
    })

    it('com dois blocos, cada um tem os três campos próprios', async () => {
        await montar('Cardio', [
            { durationSeconds: 300, advanced_config: { speed: 4 } },
            { durationSeconds: 600, advanced_config: { speed: 5 } },
        ])
        expect(screen.getByLabelText('Minutos do bloco 1')).toBeTruthy()
        expect(screen.getByLabelText('Velocidade do bloco 2')).toBeTruthy()
        expect(screen.getByLabelText('Inclinação do bloco 2')).toBeTruthy()
    })

    it('exercício de FORÇA continua com Sets e sem blocos', async () => {
        await montar('Normal', [])
        expect(document.querySelector('#edit-exercise-sets'), 'força perdeu o campo Sets').toBeTruthy()
        expect(screen.queryByText(/Adicionar bloco/i)).toBeNull()
    })
})
