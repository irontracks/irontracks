import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'

/**
 * Em iPhone SE, criar conta era IMPOSSÍVEL.
 *
 * Medido em produção com 375×667, no formulário de cadastro (27/08/2026):
 *
 *   altura do conteúdo   998 px
 *   viewport             667 px
 *   excedente            331 px  — inalcançáveis
 *   fora da tela         E-mail, Senha, Confirmar senha e o botão CRIAR CONTA
 *   document.scrollHeight === viewport  → NADA rolava
 *
 * A causa são duas regras que só falham JUNTAS: o container usava `min-h-dvh`,
 * então crescia com o conteúdo, e `html, body { height: 100% }` (globals.css)
 * trava o documento na viewport. O container transbordava sem que nada pudesse
 * rolar. Nenhuma das duas é errada sozinha — por isso passou.
 *
 * Não é aperto de layout: é aquisição de usuário bloqueada no aparelho.
 *
 * jsdom não calcula layout, então isto é source-guard: trava a FORMA que
 * produziu o defeito. A prova de que a correção resolve foi feita no navegador,
 * com a viewport real.
 */

const login = readFileSync(join(__dirname, '..', 'LoginScreen.tsx'), 'utf8')

/** O container externo da tela — a primeira div do return. */
const container = (() => {
    const i = login.indexOf('bg-neutral-950 text-white p-4')
    if (i === -1) return ''
    const abre = login.lastIndexOf('className="', i)
    return login.slice(abre, i + 40)
})()

/** O card, identificado pelo raio de arte que só ele usa. */
const card = (() => {
    const i = login.indexOf('rounded-[2rem]')
    if (i === -1) return ''
    const abre = login.lastIndexOf('className="', i)
    return login.slice(abre, login.indexOf('">', i) + 2)
})()

describe('a tela de entrada cabe em tela pequena', () => {
    it('o guard encontrou o container e o card', () => {
        expect(container).not.toBe('')
        expect(card).not.toBe('')
    })

    it('o container tem altura FIXA e rola por dentro', () => {
        // `min-h-dvh` deixa o container crescer além da viewport, e como o
        // documento não rola (html/body em height:100%), o excedente some.
        expect(container, 'min-h-dvh deixa o container crescer e o excedente fica fora da tela').not.toMatch(/\bmin-h-dvh\b/)
        expect(container).toMatch(/\bh-dvh\b/)
        expect(container).toMatch(/overflow-y-auto/)
    })

    it('não centraliza por justify-center — ele corta o TOPO quando estoura', () => {
        // Com overflow, `justify-center` empurra o começo do conteúdo para fora
        // e ele fica inalcançável mesmo rolando. `my-auto` cede em vez de cortar.
        expect(container).not.toMatch(/justify-center/)
        expect(card).toMatch(/\bmy-auto\b/)
    })

    /**
     * Sem `shrink-0` o flex COMPRIME o card para caber na altura fixa — e como
     * o card tem `overflow-hidden`, o conteúdo é cortado em silêncio. Medido ao
     * validar a correção no navegador: o card ia de 813 px para 667 px e os
     * campos sumiam sem nenhum aviso.
     */
    it('o card não pode ser comprimido — ele esconde o que não couber', () => {
        expect(card).toMatch(/\bshrink-0\b/)
        expect(card, 'o overflow-hidden é o que torna a compressão silenciosa').toMatch(/overflow-hidden/)
    })

    it('a premissa continua valendo: o documento não rola sozinho', () => {
        const css = readFileSync(join(__dirname, '..', '..', 'app', 'globals.css'), 'utf8')
        const bloco = css.slice(css.indexOf('html,\nbody {'), css.indexOf('}', css.indexOf('html,\nbody {')))
        // Se um dia isto virar `min-height`, o documento passa a rolar e a
        // regra acima deixa de ser a única defesa — mas continua correta.
        expect(bloco).toMatch(/height:\s*100%/)
    })
})
