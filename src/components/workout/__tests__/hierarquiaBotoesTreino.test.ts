import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { IRON_RANK_NAMES } from '@/utils/gamification/ironRank'

/**
 * Ênfase visual no treino ativo — auditoria de design, ago/2026.
 *
 * A hierarquia estava invertida: "Concluir" — o botão mais tocado do app, ~18
 * vezes por sessão — era cinza sobre cinza, enquanto "Finalizar", tocado UMA
 * vez, dominava o rodapé em gold sólido. O botão de sair pesava mais que o de
 * trabalhar.
 *
 * Agora: "Concluir" pendente em gold, e o sólido do rodapé fica RESERVADO para
 * quando o treino está completo — vira sinal de progresso, não só de saída.
 */

const SRC = join(__dirname, '..', '..', '..')
const normalSet = readFileSync(join(SRC, 'components', 'workout', 'set-renderers', 'normalSet.tsx'), 'utf8')
const footer = readFileSync(join(SRC, 'components', 'workout', 'WorkoutFooter.tsx'), 'utf8')

describe('Concluir — o botão mais tocado', () => {
    it('pendente tem ênfase gold, não cinza-em-cinza', () => {
        // Os dois caminhos: bilateral e unilateral (btnColor).
        const ocorrencias = normalSet.match(/bg-yellow-500\/10 border border-yellow-500\/40 text-yellow-300/g) || []
        expect(ocorrencias.length, 'bilateral e unilateral precisam da mesma ênfase').toBeGreaterThanOrEqual(2)
    })

    it('concluído continua verde — o estado final não muda', () => {
        expect(normalSet).toContain('bg-emerald-500 text-black')
    })
})

describe('Finalizar — o botão tocado uma vez', () => {
    it('só fica sólido quando o treino está completo', () => {
        const bloco = footer.slice(footer.indexOf("'inline-flex items-center gap-2 px-5 py-3"), footer.indexOf('<Save size={16} />'))
        expect(bloco).toMatch(/allDone[\s\S]*?bg-gradient-to-r from-yellow-400/)
    })

    it('com série pendente, é discreto', () => {
        const bloco = footer.slice(footer.indexOf("'inline-flex items-center gap-2 px-5 py-3"), footer.indexOf('<Save size={16} />'))
        // O ramo final do ternário (sem allDone, sem finishing) é a linha que
        // vale: ela não pode ser gold, senão a inversão volta.
        const ramoPendente = bloco.split('\n').find((l) => l.includes('bg-neutral-900')) || ''
        expect(ramoPendente, 'ramo pendente sumiu — o rodapé voltou a ser sólido sempre').toBeTruthy()
        expect(ramoPendente).not.toContain('from-yellow')
    })
})

describe('texto que o usuário lê', () => {
    it('o primeiro nível do Iron Rank concorda em gênero', () => {
        expect(IRON_RANK_NAMES[0]).toBe('Iniciante do Ferro')
        expect(IRON_RANK_NAMES[0], '"das Ferros" mistura artigo feminino com substantivo masculino')
            .not.toMatch(/das Ferros/)
    })

    it('o resumo VIP não despeja texto cru de log na tela', () => {
        const card = readFileSync(join(SRC, 'components', 'vip', 'VipWeeklySummaryCard.tsx'), 'utf8')
        expect(card, 'whitespace-pre-wrap com saída de API é log, não interface')
            .not.toContain('whitespace-pre-wrap')
        expect(card, 'os PRs viraram lista estruturada').toContain('Recordes da semana')
    })
})
