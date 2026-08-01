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

    it.each(files)('%s despacha irontracks:workouts-changed depois de escrever', (file) => {
        const src = readFileSync(file, 'utf8')
        expect(src).toContain("new CustomEvent('irontracks:workouts-changed')")
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
        expect(src).toMatch(/const list = organizing \? draft : exercises/)
    })
})
