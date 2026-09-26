import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { etapaAtiva } from '../etapaAtiva'

/**
 * "Como funciona": o vídeo fixo troca conforme a etapa que cruza o meio da tela.
 *
 * Duas versões anteriores falharam em silêncio, medido no navegador em
 * 26/09/2026: a detecção por visibilidade de cada etapa nunca achava 55% de uma
 * etapa alta, e o `useScroll` do Motion 12 anima pela linha do tempo nativa do
 * navegador e não entrega o progresso ao JavaScript. Nas duas o vídeo ficava
 * preso na primeira etapa — nenhum erro, nenhum teste vermelho.
 */

const TELA = 900
const COLUNA = 2400 // 3 etapas de 800px

describe('etapaAtiva', () => {
    it('antes da coluna chegar ao meio da tela: primeira etapa', () => {
        expect(etapaAtiva(TELA, COLUNA, TELA, 3)).toBe(0)
    })

    it('cada terço da coluna no meio da tela ativa a sua etapa', () => {
        // topo tal que o centro da tela (450) cai em 10%, 50% e 90% da coluna
        expect(etapaAtiva(450 - COLUNA * 0.1, COLUNA, TELA, 3)).toBe(0)
        expect(etapaAtiva(450 - COLUNA * 0.5, COLUNA, TELA, 3)).toBe(1)
        expect(etapaAtiva(450 - COLUNA * 0.9, COLUNA, TELA, 3)).toBe(2)
    })

    it('a fronteira exata entre etapas pertence à de baixo', () => {
        expect(etapaAtiva(450 - 800, COLUNA, TELA, 3)).toBe(1)
        expect(etapaAtiva(450 - 799, COLUNA, TELA, 3)).toBe(0)
    })

    it('depois do fim da coluna: fica na última (não passa do limite)', () => {
        expect(etapaAtiva(-5000, COLUNA, TELA, 3)).toBe(2)
    })

    it('coluna sem altura ou uma etapa só não quebra', () => {
        expect(etapaAtiva(0, 0, TELA, 3)).toBeGreaterThanOrEqual(0)
        expect(etapaAtiva(123, COLUNA, TELA, 1)).toBe(0)
    })
})

describe('a fiação: é o ouvinte de rolagem que chama a regra', () => {
    const src = readFileSync(join(__dirname, '..', 'StoryScroll.tsx'), 'utf8')
    const codigo = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '')

    it('StoryScroll mede a coluna com etapaAtiva num ouvinte de scroll da janela', () => {
        // As pontas passam isoladas: a função certa sem ninguém chamando deixaria
        // o vídeo preso de novo.
        expect(codigo).toMatch(/window\.addEventListener\('scroll'/)
        expect(codigo).toMatch(/etapaAtiva\(\s*r\.top,\s*r\.height,\s*window\.innerHeight/)
    })

    it('não volta a depender do progresso do useScroll no JavaScript', () => {
        expect(codigo).not.toMatch(/useMotionValueEvent\(\s*scrollYProgress/)
    })
})
