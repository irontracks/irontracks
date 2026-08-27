import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'

/**
 * O botão "Seguindo" desfazia o follow no primeiro toque.
 *
 * "Seguindo" é rótulo de ESTADO — diz o que você É. O toque executava a ação
 * oposta, direto, sem confirmação. Um botão que afirma uma coisa e faz o
 * contrário quando tocado é armadilha, e aqui o custo é assimétrico: numa lista
 * rolável o toque acidental é comum, e em perfil privado voltar a seguir
 * depende de NOVA APROVAÇÃO da outra pessoa. Desfazer não está nas mãos de quem
 * errou.
 *
 * É o mesmo padrão de Instagram e X, e pelo mesmo motivo.
 */

const src = readFileSync(join(__dirname, '..', 'CommunityClient.tsx'), 'utf8')
const executavel = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '')

describe('deixar de seguir pergunta antes', () => {
    it('o botão não chama unfollow direto', () => {
        expect(executavel).not.toMatch(/onClick=\{\(\) => unfollow\(/)
        expect(executavel).toMatch(/onClick=\{\(\) => confirmarUnfollow\(/)
    })

    it('a confirmação vem ANTES do unfollow', () => {
        const i = executavel.indexOf('const confirmarUnfollow')
        const bloco = executavel.slice(i, executavel.indexOf('}, [confirm, unfollow])', i))
        expect(bloco.indexOf('await confirm(')).toBeGreaterThan(-1)
        expect(bloco.indexOf('await confirm(')).toBeLessThan(bloco.indexOf('unfollow(p.id)'))
        // Sem o `if (ok)`, a pergunta vira enfeite.
        expect(bloco).toMatch(/if \(ok\) unfollow\(/)
    })

    it('diz o que se perde, inclusive o caso do perfil privado', () => {
        const i = executavel.indexOf('const confirmarUnfollow')
        const bloco = executavel.slice(i, i + 900)
        expect(bloco).toMatch(/nova aprovação/)
        expect(bloco).toMatch(/confirmText: 'Deixar de seguir'/)
        expect(bloco).toMatch(/cancelText: 'Continuar seguindo'/)
        expect(bloco).toMatch(/destructive: true/)
    })

    /**
     * `useDialog` LANÇA sem provider, e `/community` é rota própria — não passa
     * pelo shell do dashboard. Sem este wrapper a Comunidade quebraria inteira,
     * não só a confirmação.
     */
    it('a árvore tem DialogProvider nos DOIS caminhos de montagem', () => {
        const i = executavel.indexOf('export default function CommunityClient')
        const wrapper = executavel.slice(i, executavel.indexOf('function CommunityClientInner', i))
        // embutido no dashboard e como rota própria
        expect(wrapper.match(/<DialogProvider>/g) || []).toHaveLength(2)
        expect(wrapper.match(/<GlobalDialog \/>/g) || []).toHaveLength(2)
    })
})
