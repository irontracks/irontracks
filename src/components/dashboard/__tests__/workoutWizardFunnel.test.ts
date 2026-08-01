import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Funil de criação de treino — o passo mais importante do produto, e o único
 * que não era medido.
 *
 * Medido em 01/08 com os dados de produção: 29 pessoas clicaram em "Novo
 * treino", 14 chegaram a salvar. Das 24 pessoas aprovadas que nunca criaram um
 * treino, 9 clicaram no botão (20 vezes) e nenhuma chegou ao `workout_create`.
 * Uma aluna clicou 8 vezes em dias diferentes.
 *
 * A telemetria pulava do clique direto para `workout_create` — nada no meio.
 * "Onde ela desistiu?" era uma pergunta que os dados não conseguiam nem
 * formular. Estes guards existem para o meio do funil não sumir de novo.
 */
const SRC = readFileSync('src/components/dashboard/WorkoutWizardModal.tsx', 'utf8')

describe('telemetria do wizard de criação', () => {
    it('registra a abertura — é o topo do funil', () => {
        expect(SRC).toMatch(/trackUserEvent\('wizard_open'/)
    })

    it('registra o ABANDONO com o passo em que a pessoa parou', () => {
        // O evento que responde a pergunta original. Sem ele, tudo o que se sabe
        // é "não criou treino", que não diz onde consertar.
        expect(SRC).toMatch(/trackUserEvent\('wizard_abandoned'/)
        expect(SRC).toMatch(/deepestStep: deepestStepRef\.current/)
    })

    it('mede o passo MAIS FUNDO, não o passo atual', () => {
        // Quem chega no 3 e volta pro 1 antes de fechar travou no 3. Medir o
        // atual apontaria o dedo para a tela errada.
        expect(SRC).toMatch(/if \(step > deepestStepRef\.current\) deepestStepRef\.current = step/)
    })

    it('separa quem TENTOU de quem só espiou', () => {
        // Abrir e fechar sem pedir nada é curiosidade; pedir um treino e sair de
        // mãos vazias é fracasso do produto. Contar os dois junto esconde o segundo.
        expect(SRC).toMatch(/hasStartedRef\.current = true/)
        expect(SRC).toMatch(/trackUserEvent\('wizard_generate_start'/)
    })

    it('registra o MOTIVO quando a IA não entrega', () => {
        // 'empty_plan' e 'empty_workout' são o produto falhando de cara limpa —
        // a pessoa fez tudo certo e não recebeu treino.
        expect(SRC).toMatch(/trackUserEvent\('wizard_generate_fail'/)
        expect(SRC).toMatch(/failGenerate\('empty_plan'/)
        expect(SRC).toMatch(/failGenerate\('empty_workout'/)
        expect(SRC).toMatch(/failGenerate\('exception'/)
    })

    it('marca os desfechos de sucesso, senão tudo vira abandono', () => {
        // `outcomeRef` é o que impede o wizard de reportar abandono quando a
        // pessoa na verdade seguiu para o editor manual ou usou o rascunho.
        for (const outcome of ['manual', 'draft_used', 'drafts_saved']) {
            expect(SRC).toContain(`outcomeRef.current = '${outcome}'`)
        }
        expect(SRC).toMatch(/if \(outcomeRef\.current !== 'pending'\) return/)
    })

    it('nenhum trackUserEvent pode derrubar o wizard', () => {
        // Telemetria que quebra a tela é pior que telemetria nenhuma.
        const chamadas = SRC.match(/trackUserEvent\(/g) || []
        const protegidas = SRC.match(/try \{[^}]*trackUserEvent\(/g) || []
        expect(chamadas.length).toBeGreaterThanOrEqual(8)
        expect(protegidas.length).toBe(chamadas.length)
    })
})
