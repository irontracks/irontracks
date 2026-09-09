/**
 * Os blocos de cardio editados no modal rápido CHEGAM às séries.
 *
 * A metade que o guard de tela não cobre: o `<CardioBlocosEditor>` pode estar
 * montado e alcançável, e o `saveEditExercise` continuar descartando o que o
 * usuário digitou — a tela deixaria mexer e nada gravaria, que é a pior das
 * falhas (silenciosa, e só descoberta na esteira).
 *
 * Provado por mutação em 09/09/2026: zerar `durationSeconds` na gravação passa
 * verde em todos os outros testes do hook.
 */
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useWorkoutExerciseCrud } from '../useWorkoutExerciseCrud'
import type { EditExerciseDraft } from '../../helpers/editExerciseDraft'

const ESTEIRA = {
    name: 'Esteira',
    method: 'Cardio',
    sets: 1,
    setDetails: [{ set_number: 1, reps: null, rpe: null, weight: null }],
}

const DRAFT: EditExerciseDraft = {
    name: 'Esteira',
    sets: '3',
    restTime: '60',
    method: 'Cardio',
    blocos: [
        { durationSeconds: 300, advanced_config: { speed: 4 } },
        { durationSeconds: 600, advanced_config: { speed: 5 } },
        { durationSeconds: 900, advanced_config: { speed: 6, incline: 2 } },
    ],
}

const montar = (draft: EditExerciseDraft, onUpdateSession: ReturnType<typeof vi.fn>) =>
    renderHook(() => useWorkoutExerciseCrud({
        workout: { exercises: [ESTEIRA] },
        exercises: [ESTEIRA],
        logs: {},
        getLog: () => ({}),
        updateLog: vi.fn(),
        collapsed: new Set(),
        setCollapsed: vi.fn(),
        deferredExercises: new Set(),
        setDeferredExercises: vi.fn(),
        linkedWeightExercises: new Set(),
        setLinkedWeightExercises: vi.fn(),
        editExerciseDraft: draft,
        setEditExerciseDraft: vi.fn(),
        setEditExerciseOriginal: vi.fn(),
        persistToPlan: false,
        setPersistToPlan: vi.fn(),
        editExerciseHasChanges: true,
        editExerciseIdx: 0,
        setEditExerciseIdx: vi.fn(),
        editExerciseOpen: true,
        setEditExerciseOpen: vi.fn(),
        addExerciseDraft: null,
        setAddExerciseDraft: vi.fn(),
        addExerciseOpen: false,
        setAddExerciseOpen: vi.fn(),
        organizeDraft: [],
        setOrganizeDraft: vi.fn(),
        setCurrentExerciseIdx: vi.fn(),
        onUpdateSession,
        alert: vi.fn(async () => { }),
        confirm: vi.fn(async () => true),
    } as unknown as Parameters<typeof useWorkoutExerciseCrud>[0]))

const salvarELer = async (draft: EditExerciseDraft) => {
    const onUpdateSession = vi.fn()
    const { result } = montar(draft, onUpdateSession)
    await act(async () => { await result.current.saveEditExercise() })
    expect(onUpdateSession, 'nada foi gravado na sessão').toHaveBeenCalled()
    const arg = onUpdateSession.mock.calls[0][0] as Record<string, never>
    const ex = (arg.workout as { exercises: Record<string, never>[] }).exercises[0]
    return ex as unknown as { sets: number; setDetails: { durationSeconds: number | null; advanced_config: { speed?: number; incline?: number } | null }[] }
}

describe('o que o usuário digita nos blocos chega às séries', () => {
    it('grava o tempo de CADA bloco, não só do primeiro', async () => {
        const ex = await salvarELer(DRAFT)
        expect(ex.setDetails.map((s) => s.durationSeconds)).toEqual([300, 600, 900])
    })

    it('grava velocidade e inclinação por bloco', async () => {
        const ex = await salvarELer(DRAFT)
        expect(ex.setDetails.map((s) => s.advanced_config?.speed)).toEqual([4, 5, 6])
        expect(ex.setDetails[2].advanced_config?.incline).toBe(2)
    })

    it('o número de blocos vira o número de séries', async () => {
        const ex = await salvarELer(DRAFT)
        expect(ex.sets).toBe(3)
        expect(ex.setDetails).toHaveLength(3)
    })

    it('exercício de FORÇA não é tocado pelo caminho dos blocos', async () => {
        // Sem `blocos` no rascunho, `saveEditExercise` não pode escrever
        // `durationSeconds: null` por cima de uma série de musculação.
        const ex = await salvarELer({ name: 'Supino', sets: '1', restTime: '60', method: 'Normal' })
        expect(ex.setDetails[0].durationSeconds).toBeUndefined()
    })
})
