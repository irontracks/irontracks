import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

/**
 * Flag desconhecida NUNCA pode virar texto de loja.
 *
 * O parser de `ios-submit.mjs` tinha um `else if (!releaseNotes) releaseNotes = a`
 * como último caso: qualquer argumento não reconhecido era engolido como as
 * "Novidades desta versão".
 *
 * Em 27/08/2026 um `--status` — flag que não existe neste script — foi gravado
 * como release notes da versão 1.21.1 no App Store Connect, e ficou lá,
 * visível. Teria ido a review assim se alguém submetesse sem olhar o campo.
 *
 * O agravante é o padrão do script: ele roda em **LIVE SUBMIT** quando nenhuma
 * flag pede o contrário. Engolir argumento desconhecido num programa que fala
 * com a App Store por padrão é caro — o `--dry-run` existe justamente para
 * quem só quer olhar.
 */

const src = readFileSync('scripts/ios-submit.mjs', 'utf8')
const executavel = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '')

describe('argumento desconhecido aborta', () => {
    it('o parser recusa qualquer coisa que comece com "-"', () => {
        expect(executavel).toMatch(/a\.startsWith\('-'\)/)
        // Aborta de verdade, não só avisa.
        const i = executavel.indexOf("a.startsWith('-')")
        const bloco = executavel.slice(i, i + 700)
        expect(bloco).toMatch(/process\.exit\(2\)/)
    })

    it('o abort vem ANTES de virar release notes', () => {
        // A ordem é o defeito inteiro: com o `else if (!releaseNotes)` primeiro,
        // a flag desconhecida vira texto antes de qualquer checagem.
        const iFlag = executavel.indexOf("a.startsWith('-')")
        const iNotas = executavel.indexOf('releaseNotes = a')
        expect(iFlag).toBeGreaterThan(-1)
        expect(iNotas).toBeGreaterThan(-1)
        expect(iFlag).toBeLessThan(iNotas)
    })

    it('a mensagem diz qual é a saída para quem só queria olhar', () => {
        const i = executavel.indexOf("a.startsWith('-')")
        expect(executavel.slice(i, i + 700)).toMatch(/--dry-run/)
    })

    /**
     * O padrão continua sendo LIVE SUBMIT — não mudei isso, porque é o uso
     * normal do script. O que mudou é ele não aceitar mais um argumento que
     * não entende enquanto está nesse modo.
     */
    it('o modo padrão continua explícito na saída', () => {
        expect(executavel).toMatch(/dryRun \? 'DRY RUN \(no submission\)' : 'LIVE SUBMIT'/)
    })
})
