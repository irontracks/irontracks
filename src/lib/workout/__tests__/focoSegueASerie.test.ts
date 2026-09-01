import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { focoAposSerieConcluida } from '../focoAposSerie'
import { buildRailItems, aparenciaDoItem } from '../exerciseRail'

/**
 * O exercício da VEZ segue a série concluída (01/09/2026).
 *
 * Relato do dono, com print: o chip dourado da tira ficava parado no exercício
 * 01 durante o treino inteiro, e a tela bloqueada anunciava "Leg press 45°"
 * enquanto ele estava na cadeira flexora. Mesma causa: `currentExerciseIdx` só
 * mudava por TOQUE (cabeçalho do card, modal, "fazer depois"), nunca por
 * treinar.
 *
 * Os casos abaixo medem COMPORTAMENTO — o índice que sai da regra e a cor que a
 * tira veste com ele. O guard de forma no fim cobre só o que não dá para
 * exercitar sem montar o controller inteiro: os dois caminhos de saída do
 * `updateLog`.
 */

const ex = (name: string, sets: number) => ({ name, sets })
const feito = (exIdx: number, setIdx: number) => [`${exIdx}-${setIdx}`, { done: true }] as const

const ctxDe = (
    exercises: unknown[],
    logs: Record<string, unknown>,
    deferred: number[] = [],
) => ({ exercises, logs, deferred: new Set(deferred) })

describe('foco segue a série concluída', () => {
    const treino = [ex('Leg press', 2), ex('Cadeira flexora', 2), ex('Abdominal', 2)]

    it('exercício em andamento: o foco é ELE (era o que ficava preso no 01)', () => {
        const ctx = ctxDe(treino, Object.fromEntries([feito(1, 0)]))
        expect(focoAposSerieConcluida(ctx, 1)).toBe(1)
    })

    it('última série do exercício: anda para o próximo pendente', () => {
        const ctx = ctxDe(treino, Object.fromEntries([feito(0, 0), feito(0, 1)]))
        expect(focoAposSerieConcluida(ctx, 0)).toBe(1)
    })

    it('pula o que está guardado para depois', () => {
        const ctx = ctxDe(treino, Object.fromEntries([feito(0, 0), feito(0, 1)]), [1])
        expect(focoAposSerieConcluida(ctx, 0)).toBe(2)
    })

    it('pula o que já está concluído', () => {
        const ctx = ctxDe(
            treino,
            Object.fromEntries([feito(0, 0), feito(0, 1), feito(1, 0), feito(1, 1)]),
        )
        expect(focoAposSerieConcluida(ctx, 0)).toBe(2)
    })

    it('nada mais pendente: FICA onde está, não inventa destino', () => {
        const logs = Object.fromEntries(
            treino.flatMap((_, i) => [feito(i, 0), feito(i, 1)]),
        )
        expect(focoAposSerieConcluida(ctxDe(treino, logs), 2)).toBe(2)
    })

    it('índice inválido não vira foco 0 por acidente', () => {
        const ctx = ctxDe(treino, {})
        expect(focoAposSerieConcluida(ctx, Number.NaN)).toBeNull()
        expect(focoAposSerieConcluida(ctx, -1)).toBeNull()
        expect(focoAposSerieConcluida(ctx, 99)).toBeNull()
    })

    it('a TIRA acompanha: o dourado sai do 01 e vai para onde a série foi feita', () => {
        // O sintoma do print: 01/02/03 verdes, o usuário no 04, e o anel dourado
        // ainda no 01. Aqui o mesmo estado, com o foco vindo da regra.
        const cinco = [
            ex('Leg press', 1), ex('Cadeira extensora', 1), ex('Stiff', 1),
            ex('Cadeira flexora', 2), ex('Abdominal', 2),
        ]
        const logs = Object.fromEntries([feito(0, 0), feito(1, 0), feito(2, 0), feito(3, 0)])
        const ctx = ctxDe(cinco, logs)
        const foco = focoAposSerieConcluida(ctx, 3)
        expect(foco).toBe(3)
        const itens = buildRailItems(ctx, foco as number)
        expect(itens.map(aparenciaDoItem)).toEqual([
            'feito', 'feito', 'feito', 'atual', 'pendente',
        ])
    })
})

/**
 * Guard de fiação — o `updateLog` do controller é o ponto ÚNICO por onde os 14
 * renderers passam ao marcar `done`, e ele tem DOIS caminhos de saída: o normal
 * e o de pesos vinculados, que retorna cedo. Cobrir só um deixaria o foco
 * parado justamente para quem usa o cadeado de peso — e nenhum teste de unidade
 * enxerga isso, porque o controller não é montado em lugar nenhum da suíte.
 */
describe('fiação no updateLog', () => {
    const executavel = readFileSync(
        join(__dirname, '..', '..', '..', 'components', 'workout', 'useActiveWorkoutController.ts'),
        'utf8',
    )
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/^\s*\/\/.*$/gm, '')

    it('a decisão vem da regra única, não de aritmética solta', () => {
        expect(executavel).toContain('focoAposSerieConcluida')
    })

    it('os DOIS caminhos de saída movem o foco', () => {
        const chamadas = executavel.match(/moverFocoSeConcluiu\(\)/g) || []
        expect(chamadas.length, 'o caminho de pesos vinculados retorna cedo').toBe(2)
    })
})
