import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { computeDelta, daysBetween } from '../assessmentDelta'

/**
 * Redesign do histórico de avaliações (ago/2026, pedido do dono: "muito
 * amador"). O defeito não era só acabamento: o card mostrava cinco números do
 * mesmo tamanho e NENHUMA evolução — 88,2 kg virando 92,5 estava na tela e
 * ninguém via, porque exigia rolar e fazer a conta de cabeça.
 */
describe('computeDelta', () => {
    it('calcula a variação com sinal tipográfico', () => {
        expect(computeDelta(92.5, 88.2, null)).toMatchObject({ diff: 4.3, label: '+4.3' })
        // menos tipográfico (−), não hífen: alinha melhor e não vira quebra de linha
        expect(computeDelta(11.3, 12.2, 'down')?.label).toBe('−0.9')
    })

    it('gordura caindo é BOM, subindo é ruim', () => {
        expect(computeDelta(11.3, 12.2, 'down')?.tone).toBe('good')
        expect(computeDelta(13.0, 12.2, 'down')?.tone).toBe('bad')
    })

    it('massa magra subindo é BOM, caindo é ruim', () => {
        expect(computeDelta(82.1, 77.4, 'up')?.tone).toBe('good')
        expect(computeDelta(75.0, 77.4, 'up')?.tone).toBe('bad')
    })

    it('PESO nunca é julgado — o app não sabe o objetivo de quem olha', () => {
        // Subir é ganho em bulking e problema em corte. Pintar de vermelho seria
        // opinião disfarçada de dado.
        expect(computeDelta(92.5, 88.2, null)?.tone).toBe('neutral')
        expect(computeDelta(84.0, 88.2, null)?.tone).toBe('neutral')
    })

    it('variação que arredonda para zero não vira seta', () => {
        // "+0.0" com seta verde é ruído com cara de sinal.
        expect(computeDelta(88.24, 88.2, null)).toBeNull()
        expect(computeDelta(88.2, 88.2, null)).toBeNull()
    })

    it('sem avaliação anterior não inventa variação', () => {
        expect(computeDelta(88.2, null, null)).toBeNull()
        expect(computeDelta(88.2, undefined, 'down')).toBeNull()
        expect(computeDelta(null, 88.2, 'up')).toBeNull()
        expect(computeDelta(NaN, 88.2, null)).toBeNull()
    })
})

describe('daysBetween', () => {
    it('dá escala à variação (+4.3 kg em 30 dias ≠ em 300)', () => {
        expect(daysBetween('2024-09-18', '2024-03-14')).toBe(188)
    })

    it('ignora ordem invertida e datas inválidas', () => {
        expect(daysBetween('2024-03-14', '2024-09-18')).toBeNull()
        expect(daysBetween('ontem', '2024-03-14')).toBeNull()
        expect(daysBetween(null, undefined)).toBeNull()
    })
})

describe('lista do histórico', () => {
    const HIST = readFileSync('src/components/assessment/AssessmentHistory.tsx', 'utf8')
    const ITEM = readFileSync('src/components/assessment/AssessmentListItem.tsx', 'utf8')

    it('mostra a avaliação MAIS RECENTE primeiro', () => {
        // Pedido do dono: "as últimas precisam estar por primeiro, não lá no final".
        expect(HIST).toMatch(/\[\.\.\.sortedAssessments\]\.reverse\(\)\.map/)
    })

    it('NÃO inverte a fonte dos gráficos — eles são linha do tempo', () => {
        // `buildAssessmentChartData` monta os labels na ordem e faz slice(-N) das
        // mais recentes: inverter ali desenharia o gráfico ao contrário.
        expect(HIST).toMatch(/assessments=\{sortedAssessments\}/)
        expect(HIST).not.toMatch(/sortedAssessments\.reverse\(\)/) // reverse sem cópia mutaria o array
    })

    it('compara com a anterior no TEMPO, não com a linha de baixo', () => {
        // Com a lista invertida, a vizinha visual é a anterior — mas depender
        // disso quebraria em qualquer mudança de ordenação.
        expect(HIST).toMatch(/const idx = sortedAssessments\.length - 1 - revIdx/)
        expect(HIST).toMatch(/sortedAssessments\[idx - 1\]/)
    })

    it('o card destaca peso e gordura e mostra a variação', () => {
        expect(ITEM).toMatch(/computeDelta\(peso,/)
        expect(ITEM).toMatch(/computeDelta\(bf,[\s\S]{0,90}'down'\)/)
        expect(ITEM).toMatch(/computeDelta\(lean,[\s\S]{0,90}'up'\)/)
        // peso sem julgamento de cor
        expect(ITEM).toMatch(/computeDelta\(peso,[\s\S]{0,90}, null\)/)
    })

    it('não sobrou a grade antiga que deixava o TDEE órfão', () => {
        // 5 itens em 2 colunas = 2+2+1, com o último card sozinho e torto.
        expect(ITEM).not.toMatch(/grid-cols-2 md:grid-cols-5/)
    })
})
