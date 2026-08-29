import { describe, it, expect } from 'vitest'
import {
    opcoesDeStatus,
    badgeDeStatus,
    resumirStatusDeAlunos,
    graficoDeStatus,
    rotuloDeStatus,
    normalizarStatus,
    CHAVE_SEM_STATUS,
} from '../studentStatus'

/**
 * O gráfico "Status dos Alunos" tinha cinco colunas fixas e o banco, dois
 * status. Estes casos travam as quatro decisões que saíram daquela medição.
 */

/** A base real medida em 28/08/2026: 32 `pago` e 24 `ativo`. Nada mais. */
const baseReal = [
    ...Array.from({ length: 32 }, () => ({ status: 'pago' })),
    ...Array.from({ length: 24 }, () => ({ status: 'ativo' })),
]

describe('resumirStatusDeAlunos', () => {
    it('mostra só os status que EXISTEM — a base real dá duas colunas, não cinco', () => {
        const fatias = resumirStatusDeAlunos(baseReal)
        expect(fatias.map((f) => f.rotulo)).toEqual(['Pago', 'Ativo'])
        expect(fatias.map((f) => f.quantidade)).toEqual([32, 24])
    })

    it('`ativo` tem NOME — não some dentro de "Outros"', () => {
        // Era o defeito com maior alcance: 43% da base rotulada com a palavra
        // mais vazia possível.
        const fatias = resumirStatusDeAlunos(baseReal)
        expect(fatias.some((f) => f.rotulo === 'Outros')).toBe(false)
        expect(fatias.find((f) => f.rotulo === 'Ativo')?.quantidade).toBe(24)
    })

    it('nunca devolve categoria com zero', () => {
        // Barra de valor zero ocupa coluna para não informar nada — e com o
        // `borderRadius` do Chart.js ainda desenha um toco que parece "quase 1".
        for (const f of resumirStatusDeAlunos(baseReal)) {
            expect(f.quantidade).toBeGreaterThan(0)
        }
    })

    it('aluno sem status é "Sem status", não "Pendente"', () => {
        // O código antigo fazia `String(raw || 'pendente')` e inventava uma
        // categoria que o banco não tem.
        const fatias = resumirStatusDeAlunos([
            { status: 'pago' },
            { status: null },
            { status: '   ' },
            {},
        ])
        const semStatus = fatias.find((f) => f.rotulo === 'Sem status')
        expect(semStatus?.quantidade).toBe(3)
        expect(fatias.some((f) => f.rotulo === 'Pendente')).toBe(false)
    })

    it('"cancelar" é verbo: o rótulo exibido é "Cancelado"', () => {
        expect(resumirStatusDeAlunos([{ status: 'cancelar' }])[0].rotulo).toBe('Cancelado')
    })

    it('as duas grafias de cancelamento viram UMA fatia', () => {
        const fatias = resumirStatusDeAlunos([
            { status: 'cancelar' },
            { status: 'cancelado' },
            { status: 'cancelar' },
        ])
        expect(fatias).toHaveLength(1)
        expect(fatias[0]).toMatchObject({ rotulo: 'Cancelado', quantidade: 3 })
    })

    it('status novo no banco aparece com nome, sem precisar entrar na tabela', () => {
        // A lista de conhecidos dá NOME e COR melhores; ela não filtra o que
        // pode ser exibido. Senão o próximo status volta a cair em "Outros".
        const fatias = resumirStatusDeAlunos([{ status: 'em_negociacao' }])
        expect(fatias[0].rotulo).toBe('Em negociacao')
        expect(fatias[0].quantidade).toBe(1)
    })

    it('ordena por quantidade, e o empate não dança entre renders', () => {
        const fatias = resumirStatusDeAlunos([
            { status: 'atrasado' },
            { status: 'pago' },
            { status: 'pago' },
            { status: 'ativo' },
        ])
        expect(fatias.map((f) => f.rotulo)).toEqual(['Pago', 'Ativo', 'Atrasado'])
    })

    it('lista vazia não quebra e não inventa coluna', () => {
        expect(resumirStatusDeAlunos([])).toEqual([])
        expect(resumirStatusDeAlunos([null, undefined])).toEqual([])
    })

    it('é indiferente a caixa e espaço em volta', () => {
        expect(resumirStatusDeAlunos([{ status: '  PAGO ' }])[0].rotulo).toBe('Pago')
        expect(normalizarStatus('  ')).toBe(CHAVE_SEM_STATUS)
    })
})

describe('graficoDeStatus', () => {
    it('rótulo, valor e cor andam juntos — desalinhar pinta o dado errado', () => {
        const fatias = resumirStatusDeAlunos(baseReal)
        const g = graficoDeStatus(fatias)
        expect(g.labels).toEqual(['Pago', 'Ativo'])
        expect(g.datasets[0].data).toEqual([32, 24])
        expect(g.datasets[0].backgroundColor).toHaveLength(2)
        expect(g.datasets[0].backgroundColor[0]).toBe(fatias[0].cor)
        expect(g.datasets[0].backgroundColor[1]).toBe(fatias[1].cor)
    })

    it('cada status tem cor própria — duas colunas iguais não se distinguem', () => {
        const g = graficoDeStatus(resumirStatusDeAlunos(baseReal))
        const cores = g.datasets[0].backgroundColor
        expect(new Set(cores).size).toBe(cores.length)
    })
})

describe('rotuloDeStatus — a lista de alunos e o gráfico falam a mesma língua', () => {
    it('usa a mesma tabela do gráfico', () => {
        for (const bruto of ['pago', 'ativo', 'cancelar', 'atrasado']) {
            const doGrafico = resumirStatusDeAlunos([{ status: bruto }])[0].rotulo
            expect(rotuloDeStatus(bruto)).toBe(doGrafico)
        }
    })

    it('sem status não vira "pendente" também aqui', () => {
        expect(rotuloDeStatus(null)).toBe('Sem status')
        expect(rotuloDeStatus('')).toBe('Sem status')
    })
})


describe('opcoesDeStatus — o `<select>` precisa conseguir exibir o aluno', () => {
    it('oferece `ativo` — o status de 43% da base, que o select não tinha', () => {
        // Um `<select>` cujo `value` não casa com nenhuma `<option>` não exibe o
        // estado real: o navegador cai na primeira opção, e a tela passa a
        // afirmar um status que o banco não tem.
        expect(opcoesDeStatus().map((o) => o.value)).toContain('ativo')
    })

    it('o status ATUAL sempre tem opção, mesmo desconhecido', () => {
        const opcoes = opcoesDeStatus('em_negociacao')
        const atual = opcoes.find((o) => o.value === 'em_negociacao')
        expect(atual, 'sem esta opção o select exibiria outro status').toBeTruthy()
        expect(atual?.label).toBe('Em negociacao')
    })

    it('não duplica quando o status atual já é escolhível', () => {
        const opcoes = opcoesDeStatus('pago')
        expect(opcoes.filter((o) => o.value === 'pago')).toHaveLength(1)
    })

    it('"sem status" não vira opção escolhível — ninguém ESCOLHE não ter status', () => {
        expect(opcoesDeStatus(null).map((o) => o.value)).not.toContain('sem_status')
        expect(opcoesDeStatus('').map((o) => o.value)).not.toContain('')
    })

    it('grafia legada não é oferecida duas vezes', () => {
        // `cancelar` (gravada) é escolhível; `cancelado` não — senão o dropdown
        // mostraria "Cancelado" duas vezes.
        const rotulos = opcoesDeStatus().map((o) => o.label)
        expect(rotulos.filter((r) => r === 'Cancelado')).toHaveLength(1)
    })
})

describe('badgeDeStatus — mesma tabela do rótulo e da cor', () => {
    it('cada status conhecido tem classes próprias', () => {
        expect(badgeDeStatus('pago')).toContain('green')
        expect(badgeDeStatus('ativo')).toContain('blue')
        expect(badgeDeStatus('atrasado')).toContain('red')
    })

    it('status desconhecido cai no neutro, sem quebrar', () => {
        expect(badgeDeStatus('nunca_visto')).toContain('neutral')
        expect(badgeDeStatus(null)).toContain('neutral')
    })

    it('o vermelho é do ATRASADO — não do desconhecido', () => {
        // Vermelho neste app é erro/alarme. Pintar de vermelho quem só não tem
        // status classificado seria alarme falso permanente.
        expect(badgeDeStatus('nunca_visto')).not.toContain('red')
        expect(badgeDeStatus(null)).not.toContain('red')
    })
})
