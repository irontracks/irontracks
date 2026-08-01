import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Guards das decisões de produto do card "Ajustar treino". São invariantes que
 * um refactor bem-intencionado quebraria em silêncio — e cada um já custou caro
 * uma vez nesta feature.
 */
describe('rota /api/workout/muscle-gap', () => {
    const src = readFileSync('src/app/api/workout/muscle-gap/route.ts', 'utf8')

    it('NÃO chama IA — diagnóstico é regra pura e sugestão vem do catálogo', () => {
        // Modelo generativo aqui inventaria exercício que não existe no app e
        // justificativa com cara de estudo (decisão do dono, ago/2026).
        expect(src).not.toContain('getGeminiModel')
        expect(src).not.toContain('safeGemini')
        expect(src).not.toContain('buildUserContextBlock')
        expect(src).toContain('diagnoseMuscleGap')
        expect(src).toContain("from('exercise_library')")
    })

    it('só sugere exercício quando falta PADRÃO', () => {
        // Em low_volume e technique a lista sai vazia de propósito: sugerir
        // exercício novo pra quem já tem volume repete o conselho errado que
        // esta feature deu uma vez ("posterior pouco treinado" com 55 séries).
        expect(src).toMatch(/diagnosis\.kind !== 'missing_pattern' \? \[\]/)
    })

    it('cues de execução só no caso technique', () => {
        expect(src).toMatch(/diagnosis\.kind === 'technique' \? \(TECHNIQUE_CUES/)
    })

    it('gateia por vínculo vivo, como as irmãs da família', () => {
        expect(src).toContain('canCoachStudent')
        expect(src).not.toMatch(/!==\s*\w*\.?trainer_id/)
    })

    it('usa a lista COMPLETA de exercícios no diagnóstico, não o top-8', () => {
        // O top-8 por carga é resumo pra IA; aqui truncar esconderia exatamente
        // os exercícios de carga leve que definem o diagnóstico.
        expect(src).toMatch(/aggregateTrainingWindow\(\[\.\.\.merged\.values\(\)\], 500\)/)
    })
})

describe('confirmação antes de escrever no treino', () => {
    const ui = readFileSync('src/components/body-photo/MuscleGapCard.tsx', 'utf8')

    it('escolher o treino NÃO grava — arma a confirmação', () => {
        // Escrever no treino da pessoa com um toque só é fácil demais de fazer
        // sem querer, com a lista aparecendo logo abaixo do dedo (pedido do dono).
        expect(ui).toMatch(/onClick=\{\(\) => chooseWorkout\(w\)\}/)
        expect(ui).toMatch(/const chooseWorkout = useCallback[\s\S]{0,200}setConfirmTarget\(workout\)/)
        // o clique no treino não chama mais a escrita direto
        expect(ui).not.toMatch(/onClick=\{\(\) => confirmAdd\(w\.id\)\}/)
    })

    it('a confirmação diz O QUE entra e ONDE', () => {
        expect(ui).toContain('Adicionar ')
        expect(ui).toMatch(/\{confirmTarget\.name\}/)
        expect(ui).toContain('Sim, adicionar')
        expect(ui).toMatch(/>\s*Não\s*</)
    })

    it('cancelar ou trocar de exercício limpa a confirmação pendente', () => {
        // Senão o "sim" seguinte gravaria no treino escolhido antes.
        expect((ui.match(/setConfirmTarget\(null\)/g) || []).length).toBeGreaterThanOrEqual(3)
    })
})

describe('escrita no treino (rota /api/workouts/exercises)', () => {
    const src = readFileSync('src/app/api/workouts/exercises/route.ts', 'utf8')

    it('recusa treino ja concluido — sessao do passado nao recebe exercicio novo', () => {
        expect(src).toContain('workout_completed')
    })

    it('insere no FIM do treino, nunca no meio', () => {
        expect(src).toMatch(/order: Number\.isFinite\(lastOrder\) \? lastOrder \+ 1 : 0/)
    })

    it('confirma o dono antes de escrever', () => {
        expect(src).toMatch(/user_id.*!==.*user\.id/)
    })
})
