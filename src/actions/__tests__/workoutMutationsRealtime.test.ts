import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Guards das correções de "precisa reiniciar o app pra ver a mudança", que
 * apareceram em três rodadas seguidas com causas DIFERENTES:
 *
 *  1. cache do CLIENTE não invalidado → faltava despachar
 *     `irontracks:workouts-changed` depois de escrever;
 *  2. cache do SERVIDOR não invalidado → escrita direta do browser deixava
 *     `dashboard:bootstrap` (300s) e `workouts:list` (60s) intactos, e o refetch
 *     trazia o dado velho por até 5 minutos;
 *  3. invalidar DURANTE o treino ativo remontava a sessão e o modal fechava
 *     sozinho — coberto em utils/workout/__tests__/persistWorkoutPlan.test.ts.
 */
describe('escrita em treino invalida a lista (sem precisar reabrir o app)', () => {
    it('as telas avisam a lista depois de escrever', () => {
        for (const file of [
            'src/components/body-photo/MuscleGapCard.tsx',
            'src/components/dashboard/QuickViewExerciseList.tsx',
        ]) {
            expect(readFileSync(file, 'utf8')).toContain('notifyWorkoutsChanged()')
        }
    })

    it('o helper único despacha o evento — e só depois de a escrita CONFIRMAR', () => {
        // Notificar após falha faria a lista recarregar o dado antigo e parecer
        // que a mudança foi revertida sozinha.
        const src = readFileSync('src/utils/workout/persistWorkoutPlan.ts', 'utf8')
        expect(src).toContain("new CustomEvent('irontracks:workouts-changed')")
        expect(src.indexOf('notifyWorkoutsChanged({ defer: options?.deferNotify })'))
            .toBeGreaterThan(src.indexOf('if (!ok) {'))
    })

    it('o hook que hidrata a lista continua escutando o evento', () => {
        // Se este listener sumir, todo dispatch vira no-op silencioso.
        const src = readFileSync('src/hooks/useWorkoutFetch.ts', 'utf8')
        expect(src).toContain("addEventListener('irontracks:workouts-changed'")
        expect(src).toMatch(/invalidateQueries/)
    })

    it('TODA gravação de plano do treino ativo passa pelo helper', () => {
        const src = readFileSync('src/components/workout/hooks/useWorkoutExerciseCrud.ts', 'utf8')
        expect(src).toContain('persistWorkoutPlan')
        expect(src).not.toContain("fetch('/api/workouts/update'")
    })
})

describe('reordenação e exclusão de exercícios', () => {
    const rota = readFileSync('src/app/api/workouts/exercises/route.ts', 'utf8')

    it('recusa treino já concluído — mexer na ordem embaralharia os logs por índice', () => {
        expect(rota).toContain('workout_completed')
    })

    it('confere que os exercícios são MESMO do treino antes de reordenar', () => {
        expect(rota).toContain('exercise_not_in_workout')
        expect(rota).toContain('incomplete_order')
    })

    it('recusa ids duplicados', () => {
        expect(rota).toContain('duplicated_ids')
    })

    it('o DELETE trava no workout_id — id de outro treino não apaga nada', () => {
        expect(rota).toMatch(/\.delete\(\)\.eq\('id', exId\)\.eq\('workout_id', body\.workoutId\)/)
    })

    it('a UI pede confirmação antes de excluir', () => {
        const ui = readFileSync('src/components/dashboard/QuickViewExerciseList.tsx', 'utf8')
        expect(ui).toContain('confirmingDelete')
        expect(ui).toContain('Excluir do treino?')
    })
})

describe('UI da reordenação', () => {
    const src = readFileSync('src/components/dashboard/QuickViewExerciseList.tsx', 'utf8')

    it('o CARD INTEIRO arrasta — punho de 16px era difícil de acertar no dedo', () => {
        expect(src).not.toContain('dragListener={false}')
        expect(src).not.toContain('useDragControls')
    })

    it('não deixa o texto ser selecionado ao segurar (as palavras grifavam)', () => {
        expect(src).toContain('select-none')
        expect(src).toContain("WebkitUserSelect: 'none'")
        expect(src).toContain("WebkitTouchCallout: 'none'")
    })

    it('não oferece organizar em treino em execução nem sem id', () => {
        expect(src).toMatch(/canReorder && allHaveId/)
    })

    it('a ordem só vai pro banco no Salvar — arrastar mexe num rascunho', () => {
        expect(src).toMatch(/organizing \? draft : exercises/)
        expect(src).toMatch(/reorderWorkoutExercises\(workoutId, draft\.map/)
        expect(src).toMatch(/const cancel = useCallback\(\(\) => \{[\s\S]*?setDraft\(\[\]\)/)
    })
})
