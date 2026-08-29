import { describe, it, expect } from 'vitest'
import {
    normalizarNomeDeExercicio,
    tokensDeExercicio,
    escolherDaBiblioteca,
    motivoDaTroca,
    QUANTAS_ALTERNATIVAS,
} from '../exerciseSwapGraph'

/**
 * `exercise_substitutions` tem 8.262 arestas cobrindo 248 exercícios — 2.702
 * curadas à mão — e ficou desde jul/2026 sem nenhum leitor de produto, enquanto
 * `/api/ai/exercise-swap` pagava Gemini para responder o mesmo.
 *
 * O que os testes cobrem é a parte PURA: resolver o nome livre que o usuário
 * digitou até a linha da biblioteca. A consulta ao grafo em si é I/O e está na
 * rota, com a IA como fallback.
 */

const biblioteca = [
    { id: '1', display_name_pt: 'Supino reto com barra', normalized_name: 'supino reto com barra', aliases: ['supino'] },
    { id: '2', display_name_pt: 'Supino reto na maquina', normalized_name: 'supino reto na maquina', aliases: null },
    { id: '3', display_name_pt: 'Supino inclinado com barra', normalized_name: 'supino inclinado com barra', aliases: null },
    { id: '4', display_name_pt: 'Rosca direta', normalized_name: 'rosca direta', aliases: ['rosca'] },
    { id: '5', display_name_pt: 'Agachamento livre', normalized_name: 'agachamento livre', aliases: null },
    { id: '6', display_name_pt: 'Elevação lateral com halteres', normalized_name: 'elevacao lateral com halteres', aliases: null },
]

describe('normalizarNomeDeExercicio', () => {
    it('tira acento, caixa e pontuação', () => {
        expect(normalizarNomeDeExercicio('Supino Reto (com barra)')).toBe('supino reto com barra')
        expect(normalizarNomeDeExercicio('  Agachamento  LIVRE  ')).toBe('agachamento livre')
        expect(normalizarNomeDeExercicio('Rosca Direta — Halter')).toBe('rosca direta halter')
    })

    it('nome vazio não vira consulta', () => {
        expect(normalizarNomeDeExercicio('')).toBe('')
        expect(normalizarNomeDeExercicio('   ')).toBe('')
    })
})

describe('tokensDeExercicio', () => {
    it('descarta preposição e palavra curta', () => {
        expect(tokensDeExercicio('Supino reto com barra')).toEqual(['supino', 'reto', 'barra'])
    })
})

describe('escolherDaBiblioteca', () => {
    it('nome exato vence', () => {
        expect(escolherDaBiblioteca('supino reto com barra', biblioteca)?.id).toBe('1')
    })

    it('alias também resolve', () => {
        expect(escolherDaBiblioteca('Supino', biblioteca)?.id).toBe('1')
    })

    it('"Supino reto" — que NÃO existe na biblioteca — acha a variante mais genérica', () => {
        // Este é o caso real: a biblioteca tem "supino reto com barra" e
        // "supino reto na maquina", nenhum "supino reto" puro. Match exato
        // sozinho responderia nada, e o usuário digita nome livre.
        const r = escolherDaBiblioteca('Supino reto', biblioteca)
        expect(r?.id).toBe('1')
    })

    it('não casa por UMA palavra solta em comum', () => {
        // "halteres" tem 1 token em comum com "elevacao lateral com halteres",
        // que tem 3 — a regra exige a MAIORIA dos tokens do candidato, senão
        // um equipamento digitado sozinho viraria um exercício qualquer.
        // (Provado por mutação: sem a regra, este caso devolve o id 6.)
        expect(escolherDaBiblioteca('halteres', biblioteca)).toBeNull()
        expect(escolherDaBiblioteca('Supino reto', biblioteca)?.display_name_pt).not.toMatch(/Rosca/)
        expect(escolherDaBiblioteca('Leg press 45', biblioteca)).toBeNull()
    })

    it('nome desconhecido devolve null — e o chamador cai na IA', () => {
        expect(escolherDaBiblioteca('exercicio inventado xyz', biblioteca)).toBeNull()
        expect(escolherDaBiblioteca('', biblioteca)).toBeNull()
        expect(escolherDaBiblioteca('supino', [])).toBeNull()
    })

    it('é indiferente a acento e caixa', () => {
        expect(escolherDaBiblioteca('SUPINO RETO NA MÁQUINA', biblioteca)?.id).toBe('2')
    })
})

describe('motivoDaTroca — explica sem inventar', () => {
    it('aresta curada é apresentada como equivalente conhecido', () => {
        expect(motivoDaTroca({ musculoIgual: true, mesmoPadrao: true, curada: true, equipamento: 'halteres' }))
            .toBe('Equivalente conhecido · halteres')
    })

    it('sem curadoria, diz o que o dado sustenta', () => {
        expect(motivoDaTroca({ musculoIgual: true, mesmoPadrao: true, curada: false, equipamento: 'barra' }))
            .toBe('mesmo músculo principal, mesmo padrão de movimento · barra')
    })

    it('nada em comum não vira promessa vazia', () => {
        expect(motivoDaTroca({ musculoIgual: false, mesmoPadrao: false, curada: false, equipamento: '' }))
            .toBe('alternativa próxima')
    })
})

describe('contrato', () => {
    it('devolve o mesmo número de alternativas que a IA devolvia', () => {
        // A UI (`AIExerciseSwap`) não muda: mesmo formato, mesma quantidade.
        expect(QUANTAS_ALTERNATIVAS).toBe(4)
    })
})
