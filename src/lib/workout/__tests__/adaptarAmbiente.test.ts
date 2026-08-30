import { describe, it, expect, vi } from 'vitest'
import { planejarAdaptacao, resumoDaAdaptacao, serveNoAmbiente } from '../adaptarAmbiente'

/**
 * "Hoje treino em casa": o treino inteiro adaptado num toque.
 *
 * A biblioteca classifica 160 exercícios como `gym` e 83 como `home`; o grafo
 * tem 8.262 arestas. Até 30/08/2026 nada ligava as duas coisas — a troca era
 * exercício por exercício, e quem viaja não troca dez, pula o dia.
 */

const BIBLIOTECA = [
    { id: 'sup', display_name_pt: 'Supino reto com barra', normalized_name: 'supino reto com barra', aliases: null, environments: ['gym'], equipment: ['barra', 'banco'] },
    { id: 'flex', display_name_pt: 'Flexão de braços', normalized_name: 'flexao de bracos', aliases: null, environments: ['home', 'gym'], equipment: ['peso_corporal'] },
    { id: 'leg', display_name_pt: 'Leg press', normalized_name: 'leg press', aliases: null, environments: ['gym'], equipment: ['maquina'] },
    { id: 'agach', display_name_pt: 'Agachamento livre', normalized_name: 'agachamento livre', aliases: null, environments: ['home', 'gym'], equipment: ['peso_corporal'] },
    { id: 'cross', display_name_pt: 'Crossover na polia', normalized_name: 'crossover na polia', aliases: null, environments: ['gym'], equipment: ['polia'] },
]

/** Mock encadeável: `select` da biblioteca e `select().in().order()` do grafo. */
const supabaseFalso = (arestas: Array<{ from_id: string; to_id: string; similarity: number }>) => ({
    from: (tabela: string) => {
        if (tabela === 'exercise_library') {
            return { select: () => Promise.resolve({ data: BIBLIOTECA, error: null }) }
        }
        return {
            select: () => ({
                in: () => ({ order: () => Promise.resolve({ data: arestas, error: null }) }),
            }),
        }
    },
}) as never

describe('serveNoAmbiente', () => {
    it('sem `environments` não se afirma nada', () => {
        expect(serveNoAmbiente({ environments: null }, 'home')).toBe(false)
        expect(serveNoAmbiente({}, 'home')).toBe(false)
    })

    it('reconhece o ambiente declarado', () => {
        expect(serveNoAmbiente({ environments: ['home', 'gym'] }, 'home')).toBe(true)
        expect(serveNoAmbiente({ environments: ['gym'] }, 'home')).toBe(false)
    })
})

describe('planejarAdaptacao', () => {
    it('troca o que não serve e MANTÉM o que já serve', async () => {
        const p = await planejarAdaptacao(
            supabaseFalso([{ from_id: 'sup', to_id: 'flex', similarity: 0.9 }]),
            ['Supino reto com barra', 'Agachamento livre'],
            'home',
        )
        expect(p.trocas).toHaveLength(1)
        expect(p.trocas[0]).toMatchObject({ indice: 0, de: 'Supino reto com barra', para: 'Flexão de braços', similaridade: 90 })
        expect(p.mantidos).toEqual(['Agachamento livre'])
    })

    it('escolhe o substituto de MAIOR similaridade que serve no ambiente', async () => {
        // A aresta mais parecida pode ser outra de academia — o que vale é a
        // melhor que efetivamente dá para fazer em casa.
        const p = await planejarAdaptacao(
            supabaseFalso([
                { from_id: 'sup', to_id: 'cross', similarity: 0.99 },
                { from_id: 'sup', to_id: 'flex', similarity: 0.80 },
            ]),
            ['Supino reto com barra'],
            'home',
        )
        expect(p.trocas[0].para).toBe('Flexão de braços')
    })

    it('sem alternativa que sirva, o exercício FICA — e é declarado', async () => {
        // Silenciar isso seria pior: o usuário aplicaria achando que o treino
        // inteiro virou caseiro e encontraria uma polia no meio.
        const p = await planejarAdaptacao(
            supabaseFalso([{ from_id: 'leg', to_id: 'cross', similarity: 0.9 }]),
            ['Leg press'],
            'home',
        )
        expect(p.trocas).toHaveLength(0)
        expect(p.semAlternativa).toEqual(['Leg press'])
    })

    it('exercício que a biblioteca não conhece não vira palpite', async () => {
        const p = await planejarAdaptacao(supabaseFalso([]), ['Exercício inventado do professor'], 'home')
        expect(p.trocas).toHaveLength(0)
        expect(p.semAlternativa).toEqual(['Exercício inventado do professor'])
    })

    it('o índice preserva a posição no treino — é por ele que se aplica', async () => {
        const p = await planejarAdaptacao(
            supabaseFalso([{ from_id: 'sup', to_id: 'flex', similarity: 0.9 }]),
            ['Agachamento livre', 'Supino reto com barra'],
            'home',
        )
        expect(p.trocas[0].indice).toBe(1)
    })

    it('lista vazia não consulta nada', async () => {
        const chamou = vi.fn()
        const p = await planejarAdaptacao({ from: chamou } as never, [], 'home')
        expect(p).toEqual({ trocas: [], mantidos: [], semAlternativa: [] })
        expect(chamou).not.toHaveBeenCalled()
    })

    it('a similaridade sai em percentual, como o resto da UI', async () => {
        const p = await planejarAdaptacao(
            supabaseFalso([{ from_id: 'sup', to_id: 'flex', similarity: 1 }]),
            ['Supino reto com barra'],
            'home',
        )
        expect(p.trocas[0].similaridade).toBe(100)
    })
})

describe('resumoDaAdaptacao', () => {
    it('diz as três coisas que importam antes de aplicar', () => {
        const texto = resumoDaAdaptacao({
            trocas: [{ indice: 0, de: 'a', para: 'b', similaridade: 90, equipamento: '' }],
            mantidos: ['c', 'd'],
            semAlternativa: ['e'],
        })
        expect(texto).toBe('1 exercício trocado · 2 já servem · 1 sem alternativa')
    })

    it('omite o que não se aplica', () => {
        expect(resumoDaAdaptacao({ trocas: [], mantidos: ['a'], semAlternativa: [] })).toBe('1 já servem')
    })
})
