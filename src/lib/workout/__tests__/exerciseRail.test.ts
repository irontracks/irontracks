import { describe, it, expect } from 'vitest'
import { buildRailItems, rotuloDoItem, aparenciaDoItem, MINIMO_PARA_MOSTRAR_TIRA } from '../exerciseRail'

/**
 * A tira de navegação do treino ativo.
 *
 * O que estes casos protegem é a CONCORDÂNCIA com o resto da tela: a tira é a
 * única coisa visível quando o usuário está longe do card, e ela dizendo
 * "pendente" sobre um exercício concluído (ou o contrário) é pior que não
 * existir — ele confia e vai ao lugar errado.
 */

const ex = (sets: number, name: string) => ({ name, sets })
const done = (exIdx: number, n: number): Record<string, unknown> => {
    const out: Record<string, unknown> = {}
    for (let i = 0; i < n; i++) out[`${exIdx}-${i}`] = { done: true }
    return out
}
const ctx = (exercises: unknown[], logs: Record<string, unknown> = {}, deferred = new Set<number>()) =>
    ({ exercises, logs, deferred })

describe('buildRailItems', () => {
    const treino = [ex(3, 'Supino reto'), ex(3, 'Rosca direta'), ex(4, 'Tríceps corda')]

    it('numera como o card numera — 01, 02, 03', () => {
        const itens = buildRailItems(ctx(treino), 0)
        expect(itens.map((i) => i.numero)).toEqual(['01', '02', '03'])
    })

    it('marca feito só quando TODAS as séries estão concluídas', () => {
        const itens = buildRailItems(ctx(treino, { ...done(0, 3), ...done(1, 2) }), 0)
        expect(itens[0].estado).toBe('feito')
        expect(itens[1].estado).toBe('pendente')
        expect(itens[1].feitas).toBe(2)
        expect(itens[1].total).toBe(3)
    })

    it('marca guardado o que foi adiado', () => {
        const itens = buildRailItems(ctx(treino, {}, new Set([1])), 0)
        expect(itens[1].estado).toBe('guardado')
    })

    it('CONCLUÍDO vence guardado — quem adiou e fez não tem mais nada guardado ali', () => {
        // Mesma regra do aviso de finalizar (`pendingDeferred`). Se divergirem,
        // a tira cobra um exercício que o diálogo já não cobra.
        const itens = buildRailItems(ctx(treino, done(1, 3), new Set([1])), 0)
        expect(itens[1].estado).toBe('feito')
    })

    it('`atual` é independente do estado — dá para estar num card já concluído', () => {
        const itens = buildRailItems(ctx(treino, done(0, 3)), 0)
        expect(itens[0].atual).toBe(true)
        expect(itens[0].estado).toBe('feito')
        expect(itens[1].atual).toBe(false)
    })

    it('sem exercício atual (índice fora da faixa), ninguém fica marcado', () => {
        const itens = buildRailItems(ctx(treino), -1)
        expect(itens.some((i) => i.atual)).toBe(false)
    })

    it('exercício sem nome ganha rótulo posicional em vez de vir vazio', () => {
        const itens = buildRailItems(ctx([{ sets: 3 }]), 0)
        expect(itens[0].nome).toBe('Exercício 1')
    })
})

describe('rotuloDoItem', () => {
    const base = { idx: 2, numero: '03', nome: 'Rosca direta', atual: false, feitas: 1, total: 3 }

    it('o número sozinho não diz nada ao leitor de tela — o rótulo leva nome e progresso', () => {
        const r = rotuloDoItem({ ...base, estado: 'pendente' })
        expect(r).toContain('Rosca direta')
        expect(r).toContain('1 de 3 séries')
    })

    it('anuncia concluído e guardado', () => {
        expect(rotuloDoItem({ ...base, estado: 'feito' })).toContain('concluído')
        expect(rotuloDoItem({ ...base, estado: 'guardado' })).toContain('guardado para depois')
    })

    it('exercício sem série não inventa contagem', () => {
        const r = rotuloDoItem({ ...base, estado: 'pendente', feitas: 0, total: 0 })
        expect(r).not.toContain('séries')
    })
})

describe('quando a tira aparece', () => {
    it('o piso existe para não gastar o topo da tela com rolagem curta', () => {
        expect(MINIMO_PARA_MOSTRAR_TIRA).toBeGreaterThanOrEqual(3)
        expect(MINIMO_PARA_MOSTRAR_TIRA).toBeLessThanOrEqual(5)
    })
})

describe('aparenciaDoItem', () => {
    it('o exercício da vez NÃO veste o verde — verde é só concluído', () => {
        expect(aparenciaDoItem({ estado: 'pendente', atual: true })).toBe('atual')
        expect(aparenciaDoItem({ estado: 'pendente', atual: false })).toBe('pendente')
    })

    it('concluído vence o foco — esconder a conclusão do card na tela seria mentir', () => {
        expect(aparenciaDoItem({ estado: 'feito', atual: true })).toBe('feito')
        expect(aparenciaDoItem({ estado: 'feito', atual: false })).toBe('feito')
    })

    it('guardado só aparece como guardado quando NÃO é o da vez', () => {
        expect(aparenciaDoItem({ estado: 'guardado', atual: true })).toBe('atual')
        expect(aparenciaDoItem({ estado: 'guardado', atual: false })).toBe('guardado')
    })
})
