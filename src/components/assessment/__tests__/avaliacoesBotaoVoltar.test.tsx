import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'

import { AssessmentHeader } from '@/components/assessment/AssessmentHeader'

/**
 * O botão de saída do card de Avaliações — varredura no simulador, 27/08/2026.
 *
 * Três defeitos no mesmo botão, e o primeiro é código morto com consequência:
 *
 * 1. `onClose` era recebido e NUNCA chamado. O botão só era renderizado
 *    `!onClose`, ou seja, FORNECER o handler apagava o botão. No dashboard com
 *    avaliações o header ficava sem saída nenhuma; no dashboard sem avaliações
 *    (`onClose={undefined}` explícito) a saída era o `history.back()` do
 *    navegador em vez do `setView('dashboard')` que o pai tinha entregue — e a
 *    aba do dashboard é ESTADO, não rota, então o destino era o que estivesse
 *    empilhado.
 *
 * 2. O ícone era um X — o desenho de fechar/descartar — num botão cujo
 *    `aria-label` diz "Voltar". Quem enxerga lia uma coisa, quem usa VoiceOver
 *    ouvia outra. O próprio `AssessmentHistory.tsx` já usa `ArrowLeft` no botão
 *    Voltar do formulário: a convenção existia e só o header a contrariava.
 *
 * Os casos de clique cobrem a fiação; o source-guard cobre o ícone, que não
 * aparece na árvore acessível (lucide desenha um `<svg aria-hidden>`).
 */

const DIR = join(__dirname, '..')
const header = readFileSync(join(DIR, 'AssessmentHeader.tsx'), 'utf8')
const historico = readFileSync(join(DIR, 'AssessmentHistory.tsx'), 'utf8')

const executavel = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '')

afterEach(cleanup)

describe('a saída do card de Avaliações', () => {
    it('usa o onClose do pai quando ele existe, sem tocar no histórico do navegador', () => {
        const onClose = vi.fn()
        const back = vi.spyOn(window.history, 'back').mockImplementation(() => {})

        render(<AssessmentHeader onCreate={() => {}} onClose={onClose} />)
        fireEvent.click(screen.getByRole('button', { name: 'Voltar' }))

        expect(onClose).toHaveBeenCalledTimes(1)
        expect(back).not.toHaveBeenCalled()
        back.mockRestore()
    })

    it('cai no histórico do navegador só quando o pai não diz para onde ir', () => {
        const back = vi.spyOn(window.history, 'back').mockImplementation(() => {})

        render(<AssessmentHeader onCreate={() => {}} />)
        fireEvent.click(screen.getByRole('button', { name: 'Voltar' }))

        expect(back).toHaveBeenCalledTimes(1)
        back.mockRestore()
    })

    it('existe nos DOIS casos — fornecer o handler não pode apagar o botão', () => {
        render(<AssessmentHeader onCreate={() => {}} onClose={() => {}} />)
        expect(screen.getByRole('button', { name: 'Voltar' })).toBeTruthy()
        cleanup()

        render(<AssessmentHeader onCreate={() => {}} />)
        expect(screen.getByRole('button', { name: 'Voltar' })).toBeTruthy()
    })
})

describe('o ícone concorda com o rótulo', () => {
    it('o botão Voltar do header desenha uma seta, não um X', () => {
        const codigo = executavel(header)
        expect(codigo).toContain('<ArrowLeft')
        // O X de fechar não pode voltar por importação nem por uso.
        expect(codigo).not.toMatch(/<X\b/)
        expect(codigo).not.toMatch(/\bX\s*[,}]\s*from 'lucide-react'/)
    })

    it('o estado vazio repassa o onClose em vez de zerá-lo', () => {
        const codigo = executavel(historico)
        expect(codigo).not.toContain('onClose={undefined}')
        expect(codigo).toContain('onClose={onClose}')
    })
})
