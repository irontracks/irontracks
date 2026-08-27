import { describe, it, expect } from 'vitest'
import { decidirAplicar, interpretarResultado } from '../../scripts/mutar.mjs'

/**
 * As decisões do `npm run mutar` — a ferramenta que substitui a prova por
 * mutação feita à mão.
 *
 * O método manual (editar, rodar, `git checkout`) tem três armadilhas, todas
 * com histórico neste repo:
 *
 * 1. O `git checkout` APAGA trabalho não commitado. Aconteceu em 15/08 e
 *    25/08/2026 — com a regra já escrita no CLAUDE.md — e três vezes na sessão
 *    de 27/08. O sintoma engana: os testes seguintes passam verdes e você
 *    conclui "provado" sobre um arquivo que voltou no tempo.
 * 2. A mutação pode NÃO ser aplicada. Um `sed` que não casa devolve o arquivo
 *    intacto, o teste passa, e "provado por mutação" vira mentira em silêncio.
 * 3. Verde com o bug reposto não é lido como falha, quando deveria gritar.
 *
 * O script mata as três: restaura do CONTEÚDO (não do índice do git), verifica
 * a substituição ANTES de rodar, e trata verde como erro. Este arquivo trava as
 * duas decisões — são elas que separam "provei" de "achei que provei".
 */

describe('decidirAplicar', () => {
    it('trecho ausente ABORTA — é o caso que passa por prova sem ser', () => {
        const r = decidirAplicar({ ocorrencias: 0, deIgualPara: false, conteudoMudou: false })
        expect(r.acao).toBe('abortar')
        expect(r.motivo).toMatch(/não existe/)
    })

    it('`de` igual a `para` ABORTA', () => {
        const r = decidirAplicar({ ocorrencias: 3, deIgualPara: true, conteudoMudou: false })
        expect(r.acao).toBe('abortar')
        expect(r.motivo).toMatch(/iguais/)
    })

    it('conteúdo que não mudou ABORTA', () => {
        const r = decidirAplicar({ ocorrencias: 2, deIgualPara: false, conteudoMudou: false })
        expect(r.acao).toBe('abortar')
        expect(r.motivo).toMatch(/idêntico/)
    })

    it('trecho presente e conteúdo diferente: aplica', () => {
        expect(decidirAplicar({ ocorrencias: 1, deIgualPara: false, conteudoMudou: true }).acao).toBe('aplicar')
    })

    /**
     * A ordem importa: `de === para` produz zero mudança E zero motivo útil se
     * for reportado como "não existe". Cada aborto precisa dizer a causa certa,
     * senão quem lê procura no lugar errado.
     */
    it('cada aborto nomeia a própria causa', () => {
        const motivos = [
            decidirAplicar({ ocorrencias: 0, deIgualPara: false, conteudoMudou: false }).motivo,
            decidirAplicar({ ocorrencias: 1, deIgualPara: true, conteudoMudou: false }).motivo,
            decidirAplicar({ ocorrencias: 1, deIgualPara: false, conteudoMudou: false }).motivo,
        ]
        expect(new Set(motivos).size).toBe(3)
    })
})

describe('interpretarResultado', () => {
    it('teste VERDE com a mutação é guard falso, não sucesso', () => {
        const r = interpretarResultado({ saidaDoTeste: 0 })
        expect(r.veredicto).toBe('guard-falso')
    })

    it('teste vermelho é o guard pegando o defeito', () => {
        expect(interpretarResultado({ saidaDoTeste: 1 }).veredicto).toBe('guard-pega')
        expect(interpretarResultado({ saidaDoTeste: 137 }).veredicto).toBe('guard-pega')
    })
})
