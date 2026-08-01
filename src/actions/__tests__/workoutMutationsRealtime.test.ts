import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Guards de duas correções feitas juntas (ago/2026), ambas reportadas pelo dono
 * na mesma frase: "para aparecer o exercício no treino selecionado, precisa
 * fechar o app por completo".
 *
 * 1. TODA escrita em treino tem que invalidar a lista. O app já tinha o canal
 *    (`irontracks:workouts-changed`, escutado por useWorkoutFetch) — quem
 *    esqueceu de despachar foi o código novo. O sintoma é caríssimo em
 *    confiança: o usuário acha que a ação não funcionou.
 *
 * 2. Reordenar exercício só em treino NÃO iniciado. Os logs da sessão são
 *    indexados por posição ("exIdx-setIdx"): trocar a ordem no meio faria o peso
 *    do exercício 3 passar a pertencer a outro.
 */
describe('escrita em treino invalida a lista (sem precisar reabrir o app)', () => {
    const files = [
        'src/components/body-photo/MuscleGapCard.tsx',
        'src/components/dashboard/QuickViewExerciseList.tsx',
    ]

    it.each(files)('%s avisa a lista depois de escrever', (file) => {
        const src = readFileSync(file, 'utf8')
        expect(src).toContain('notifyWorkoutsChanged()')
    })

    it('o helper único despacha o evento — e só depois de a escrita CONFIRMAR', () => {
        // Notificar após falha faria a lista recarregar o dado antigo e parecer
        // que a mudança foi revertida sozinha.
        const src = readFileSync('src/utils/workout/persistWorkoutPlan.ts', 'utf8')
        expect(src).toContain("new CustomEvent('irontracks:workouts-changed')")
        const notifyIdx = src.indexOf('notifyWorkoutsChanged()\n        return { ok: true }')
        expect(notifyIdx).toBeGreaterThan(src.indexOf('if (!ok) {'))
    })

    it('TODA gravação de plano do treino ativo passa pelo helper', () => {
        // Era aqui que estava o bug reportado: apagar exercício no treino ativo
        // gravava no banco e a lista só mudava reiniciando o app.
        const src = readFileSync('src/components/workout/hooks/useWorkoutExerciseCrud.ts', 'utf8')
        expect(src).toContain('persistWorkoutPlan')
        // nenhum PATCH cru sobrou fora do helper
        expect(src).not.toContain("fetch('/api/workouts/update'")
    })

    it('o hook que hidrata a lista continua escutando o evento', () => {
        // Se este listener sumir, todo dispatch acima vira no-op silencioso.
        const src = readFileSync('src/hooks/useWorkoutFetch.ts', 'utf8')
        expect(src).toContain("addEventListener('irontracks:workouts-changed'")
        expect(src).toMatch(/invalidateQueries/)
    })
})

describe('reordenação de exercícios', () => {
    const src = readFileSync('src/actions/workoutExercises-actions.ts', 'utf8')

    it('recusa treino já concluído — reordenar embaralharia os logs por índice', () => {
        expect(src).toContain('workout_completed')
    })

    it('confere que os exercícios são MESMO do treino antes de escrever', () => {
        // Sem isto, um id de outro treino moveria exercício entre treinos.
        expect(src).toContain('exercise_not_in_workout')
        expect(src).toContain('incomplete_order')
    })

    it('recusa ids duplicados', () => {
        expect(src).toContain('duplicated_ids')
    })

    it('confirma o dono antes de escrever', () => {
        expect(src).toMatch(/user_id.*!==.*user\.id/)
    })
})

describe('exclusão de exercício', () => {
    const src = readFileSync('src/actions/workoutExercises-actions.ts', 'utf8')

    it('recusa treino já iniciado — apagar do meio desloca os logs seguintes', () => {
        const bloco = src.slice(src.indexOf('export async function deleteWorkoutExercise'), src.indexOf('export async function reorderWorkoutExercises'))
        expect(bloco).toContain('workout_completed')
    })

    it('o DELETE trava no workout_id — id de outro treino não apaga nada', () => {
        const bloco = src.slice(src.indexOf('export async function deleteWorkoutExercise'), src.indexOf('export async function reorderWorkoutExercises'))
        expect(bloco).toMatch(/\.delete\(\)\s*\n\s*\.eq\('id', exId\)\s*\n\s*\.eq\('workout_id', wId\)/)
    })

    it('a UI pede confirmação antes de excluir', () => {
        const ui = readFileSync('src/components/dashboard/QuickViewExerciseList.tsx', 'utf8')
        expect(ui).toContain('confirmingDelete')
        expect(ui).toContain('Excluir do treino?')
    })
})

describe('UI da reordenação', () => {
    const src = readFileSync('src/components/dashboard/QuickViewExerciseList.tsx', 'utf8')

    it('arrasta pelo punho, não pelo card — senão rolar a lista vira arrastar', () => {
        expect(src).toContain('dragListener={false}')
        expect(src).toContain('useDragControls')
    })

    it('não oferece organizar em treino em execução nem sem id', () => {
        expect(src).toMatch(/canReorder && allHaveId/)
    })

    it('a ordem só vai pro banco no Salvar — arrastar mexe num rascunho', () => {
        // Enquanto organiza, a lista exibida vem de `draft`; o banco só é tocado
        // dentro de `save`, e `cancel` descarta o rascunho inteiro.
        expect(src).toMatch(/organizing \? draft : exercises/)
        expect(src).toMatch(/reorderWorkoutExercises\(workoutId, draft\.map/)
        expect(src).toMatch(/const cancel = useCallback\(\(\) => \{[\s\S]*?setDraft\(\[\]\)/)
    })
})
