/**
 * Guard do auto-persist do bloco unilateral (bug de 14/08/2026).
 *
 * O toggle "Atualizar plano de treino" nasce DESLIGADO — desenho certo para
 * ajuste do dia (sets/descanso), mas armadilha para propriedade intrínseca do
 * exercício: o aluno marcava "Exercício Unilateral", tocava em "Salvar"
 * achando que era definitivo, a SESSÃO recebia e o TEMPLATE não — no próximo
 * treino o exercício voltava bilateral ("toda vez que eu salvo, ele não
 * salva"). Print do dono mostra exatamente o estado: unilateral ON, persist
 * OFF.
 *
 * Regra: mudou o BLOCO UNILATERAL (toggle/descanso entre lados/troca) → o
 * persist liga sozinho; desfez → desliga de volta; o usuário tocou no toggle →
 * a escolha dele congela e o automático nunca passa por cima.
 */
import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useWorkoutModals } from '@/components/workout/hooks/useWorkoutModals'

type Draft = { name: string; sets: string; restTime: string; method: string; isUnilateral?: boolean; sideRestTime?: string | null; transitionTime?: string | null }

const SNAPSHOT: Draft = { name: 'Chest press máquina', sets: '4', restTime: '180', method: 'Normal', isUnilateral: false, sideRestTime: '', transitionTime: '' }

function abrirModal(result: { current: ReturnType<typeof useWorkoutModals> }) {
    // Mesma sequência do openEditExercise real: draft + original + reset + open.
    act(() => {
        result.current.setEditExerciseDraft(SNAPSHOT)
        result.current.setEditExerciseOriginal(SNAPSHOT)
        result.current.setPersistToPlan(false)
        result.current.setEditExerciseOpen(true)
    })
}

describe('persist automático quando o bloco unilateral muda', () => {
    it('marcar "Exercício Unilateral" liga o Atualizar plano sozinho', () => {
        const { result } = renderHook(() => useWorkoutModals(null))
        abrirModal(result)
        expect(result.current.persistToPlan).toBe(false)

        act(() => { result.current.setEditExerciseDraft({ ...SNAPSHOT, isUnilateral: true }) })

        expect(result.current.persistToPlan).toBe(true)
        expect(result.current.editExerciseHasChanges).toBe(true)
    })

    it('desfazer a mudança desliga de volta (não persiste à toa)', () => {
        const { result } = renderHook(() => useWorkoutModals(null))
        abrirModal(result)
        act(() => { result.current.setEditExerciseDraft({ ...SNAPSHOT, isUnilateral: true }) })
        expect(result.current.persistToPlan).toBe(true)

        act(() => { result.current.setEditExerciseDraft({ ...SNAPSHOT, isUnilateral: false }) })

        expect(result.current.persistToPlan).toBe(false)
    })

    it('mudar SÓ ajuste do dia (sets/descanso) NÃO liga o persist — o desenho session-first fica de pé', () => {
        const { result } = renderHook(() => useWorkoutModals(null))
        abrirModal(result)

        act(() => { result.current.setEditExerciseDraft({ ...SNAPSHOT, sets: '5', restTime: '90' }) })

        expect(result.current.editExerciseHasChanges).toBe(true)
        expect(result.current.persistToPlan).toBe(false)
    })

    it('escolha explícita do usuário congela: desligou o toggle → o automático não religa', () => {
        const { result } = renderHook(() => useWorkoutModals(null))
        abrirModal(result)
        act(() => { result.current.setEditExerciseDraft({ ...SNAPSHOT, isUnilateral: true }) })
        expect(result.current.persistToPlan).toBe(true)

        // Usuário decide: só nesta sessão.
        act(() => { result.current.setPersistToPlan(false) })
        // Mexe mais no bloco unilateral…
        act(() => { result.current.setEditExerciseDraft({ ...SNAPSHOT, isUnilateral: true, sideRestTime: '20' }) })

        expect(result.current.persistToPlan).toBe(false)
    })

    it('descanso entre lados / tempo de troca também contam como bloco unilateral', () => {
        const { result } = renderHook(() => useWorkoutModals(null))
        abrirModal(result)

        act(() => { result.current.setEditExerciseDraft({ ...SNAPSHOT, sideRestTime: '20' }) })

        expect(result.current.persistToPlan).toBe(true)
    })

    it('reabrir o modal zera o "tocado": o automático volta a funcionar na abertura seguinte', () => {
        const { result } = renderHook(() => useWorkoutModals(null))
        abrirModal(result)
        act(() => { result.current.setPersistToPlan(false) }) // toca no toggle
        act(() => { result.current.setEditExerciseOpen(false) })

        abrirModal(result)
        act(() => { result.current.setEditExerciseDraft({ ...SNAPSHOT, isUnilateral: true }) })

        expect(result.current.persistToPlan).toBe(true)
    })
})
