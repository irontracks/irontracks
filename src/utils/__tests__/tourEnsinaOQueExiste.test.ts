import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { getTourSteps } from '@/utils/tourSteps'

/**
 * O tour ensinava um nome que o app não usa mais, e uma tela que o iOS não tem.
 *
 * 1. O passo de coach se chamava "Carteira". O menu chama de **Cobranças** — o
 *    rótulo antigo foi aposentado na varredura de UI justamente por ser um
 *    segundo nome para o mesmo destino. O tour é onde a pessoa APRENDE o
 *    vocabulário do app: ela sairia dali procurando "Carteira" e não acharia.
 *
 * 2. No iOS o item some do menu (`hideVipCtas`, política da Apple sobre
 *    cobrança fora da loja) e o tour ensinava o passo assim mesmo. O professor
 *    de iPhone terminava o tutorial procurando uma tela que o app não mostra
 *    para ele — tour que ensina o que não está lá transfere ao usuário a culpa
 *    por não achar.
 */

const menu = readFileSync(join(__dirname, '..', '..', 'components', 'HeaderActionsMenu.tsx'), 'utf8')

describe('o tour usa o vocabulário do app', () => {
    it('o passo de cobranças tem o MESMO nome do item de menu', () => {
        const passo = getTourSteps({ role: 'teacher' }).find((p) => p.id === 'coach-wallet')
        expect(passo).toBeTruthy()
        expect(passo?.title).toBe('Cobranças')
    })

    /**
     * Mira no rótulo REAL do menu, não numa string fixa: se alguém renomear o
     * item lá, este caso cai junto em vez de o tour envelhecer calado — que é
     * exatamente como "Carteira" sobreviveu à própria aposentadoria.
     */
    it('e o nome sai de onde o usuário vai clicar', () => {
        const rotulo = /label="([^"]+)"[^>]*\n?[^>]*onOpenWallet/.exec(menu)?.[1]
            ?? /onOpenWallet[\s\S]{0,200}?label="([^"]+)"/.exec(menu)?.[1]
            ?? /label="(Cobranças)"/.exec(menu)?.[1]
        expect(rotulo, 'não achei o item de menu — o guard ficaria cego').toBeTruthy()
        const passo = getTourSteps({ role: 'teacher' }).find((p) => p.id === 'coach-wallet')
        expect(passo?.title).toBe(rotulo)
    })
})

describe('o tour não ensina o que o iOS esconde', () => {
    it('com o gate ligado, o passo de cobranças some', () => {
        const ids = getTourSteps({ role: 'teacher', ocultarCobrancas: true }).map((p) => p.id)
        expect(ids).not.toContain('coach-wallet')
        // Os outros passos de coach continuam.
        expect(ids).toContain('coach-panel')
        expect(ids).toContain('coach-schedule')
        expect(ids).toContain('ready')
    })

    it('sem o gate, o passo continua', () => {
        expect(getTourSteps({ role: 'teacher' }).map((p) => p.id)).toContain('coach-wallet')
    })

    it('aluno nunca vê passo de coach, com ou sem gate', () => {
        for (const gate of [true, false]) {
            const ids = getTourSteps({ role: 'student', ocultarCobrancas: gate }).map((p) => p.id)
            expect(ids.some((id) => id.startsWith('coach-'))).toBe(false)
        }
    })

    /**
     * A prop tem default falsy, então sem a fiação o gate nunca liga e nenhum
     * caso acima pega isso — é a lição do "cobrindo as pontas e não a fiação".
     */
    it('o shell passa o gate do iOS', () => {
        const shell = readFileSync(
            join(__dirname, '..', '..', 'app', '(app)', 'dashboard', 'IronTracksAppClientImpl.tsx'), 'utf8')
        expect(shell).toMatch(/ocultarCobrancas:\s*hideVipOnIos/)
    })
})
