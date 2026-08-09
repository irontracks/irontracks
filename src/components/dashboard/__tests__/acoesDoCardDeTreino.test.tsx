import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'

/**
 * Exclusão fora da linha de frente — auditoria de design, ago/2026.
 *
 * O card de treino tinha compartilhar, editar e EXCLUIR lado a lado: três
 * alvos de 44pt, mesmo tamanho, mesma cor, a um polegar de distância. Ação
 * irreversível com o mesmo peso das reversíveis — e o app é usado com a mão
 * suada, no meio da academia, com pressa.
 *
 * Agora a exclusão exige tocar "⋯" primeiro. Um toque a mais é barato quando a
 * ação não tem volta.
 */

const card = readFileSync(join(__dirname, '..', 'WorkoutCard.tsx'), 'utf8')

// Recorta os dois níveis a partir do ternário DAS AÇÕES — o arquivo tem outros
// ternários antes, e ancorar no primeiro `) : (` do arquivo pegava o bloco errado.
const inicio = card.indexOf('{!maisAberto ? (')
const divisor = card.indexOf(') : (', inicio)
const primeiroNivel = card.slice(inicio, divisor)
const segundoNivel = card.slice(divisor)

describe('ações do card', () => {
    it('a exclusão está atrás de um segundo nível', () => {
        expect(card).toContain('maisAberto')
        expect(primeiroNivel, 'excluir não pode estar no primeiro nível').not.toContain("runAction('delete'")
    })

    it('o primeiro nível mantém as ações reversíveis', () => {
        expect(primeiroNivel).toContain("runAction('share'")
        expect(primeiroNivel).toContain("runAction('edit'")
    })

    it('o botão de excluir é vermelho e tem rótulo escrito', () => {
        expect(segundoNivel).toContain("runAction('delete'")
        expect(segundoNivel).toContain('bg-red-500/10')
        expect(segundoNivel, 'ícone sozinho não avisa o que vai acontecer').toContain('Excluir')
    })

    it('dá para voltar sem excluir', () => {
        expect(segundoNivel).toContain('setMaisAberto(false)')
    })

    it('todas as ações têm nome acessível', () => {
        for (const rotulo of ['Compartilhar treino', 'Editar treino', 'Mais ações', 'Excluir treino', 'Voltar']) {
            expect(card).toContain(`aria-label="${rotulo}"`)
        }
    })
})
