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

    /**
     * Este caso já exigia share/edit NO PRIMEIRO NÍVEL. Mudou em 11/08/2026, e
     * a razão é medida: três botões de 44pt sempre visíveis somavam 148px de
     * bloco, o título reservava `pr-40` (160px) e TODO nome de treino quebrava
     * em duas linhas — três de três nos cards conferidos no aparelho. O nome é
     * lido em 100% das visitas; compartilhar e editar são ocasionais.
     *
     * O invariante que o teste realmente protege — exclusão longe do toque
     * distraído — continua, e agora está assertado de forma mais direta: ela
     * segue fora do primeiro nível e é o ÚNICO botão vermelho e com texto
     * escrito, no meio de ícones neutros.
     */
    it('o primeiro nível é só o disclosure — nenhuma ação dispara dali', () => {
        expect(primeiroNivel).not.toContain("runAction('share'")
        expect(primeiroNivel).not.toContain("runAction('edit'")
        expect(primeiroNivel).not.toContain("runAction('delete'")
        expect(primeiroNivel).toContain('setMaisAberto(true)')
    })

    it('as três ações vivem no segundo nível', () => {
        expect(segundoNivel).toContain("runAction('share'")
        expect(segundoNivel).toContain("runAction('edit'")
        expect(segundoNivel).toContain("runAction('delete'")
    })

    it('excluir continua inconfundível ao lado das outras', () => {
        // Com quatro botões no mesmo nível, a fricção passa a ser VISUAL.
        expect(segundoNivel).toContain('bg-red-500/10')
        expect(segundoNivel).toContain('Excluir')
        // E nenhuma das reversíveis pode imitar esse tratamento.
        const share = segundoNivel.slice(segundoNivel.indexOf("runAction('share'"))
        expect(share.slice(0, 400)).not.toContain('bg-red-500')
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
        for (const rotulo of ['Compartilhar treino', 'Editar treino', 'Ações do treino', 'Excluir treino', 'Voltar']) {
            expect(card).toContain(`aria-label="${rotulo}"`)
        }
    })
})
