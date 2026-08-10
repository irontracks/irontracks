import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { formatMinutesLabel } from '@/utils/report/formatters'

/**
 * Duração exibida — fonte única, ago/2026.
 *
 * O MESMO treino de 114 s aparecia de quatro jeitos no app (visto no simulador
 * em 09/08/2026):
 *
 *   card do histórico  "1 min"    Math.floor
 *   resumo do período  "2 min"    Math.round
 *   relatório          "1.9 min"  toFixed(1), com PONTO
 *   story              "1min"     outro Math.floor
 *
 * Quatro fórmulas para o mesmo número. Não é detalhe estético: quando a duração
 * diverge entre telas, o usuário passa a duvidar do volume e das calorias — e
 * esses ele não tem como conferir.
 */

describe('formatMinutesLabel', () => {
    it('o caso que expôs o problema: 114 s é o mesmo em todo lugar', () => {
        expect(formatMinutesLabel(114)).toBe('2 min')
    })

    it('arredonda — nem chão nem teto', () => {
        expect(formatMinutesLabel(90), '1,5 min arredonda para cima').toBe('2 min')
        expect(formatMinutesLabel(89)).toBe('1 min')
        // `Math.floor` daria 1 aqui e era metade da divergência original.
        expect(formatMinutesLabel(119)).toBe('2 min')
    })

    it('abaixo de 1 min mostra segundos, não "0 min"', () => {
        // Um treino de 40 s exibido como "0 min" não é impreciso, é errado.
        expect(formatMinutesLabel(40)).toBe('40 s')
        expect(formatMinutesLabel(59)).toBe('59 s')
        expect(formatMinutesLabel(60)).toBe('1 min')
    })

    it('decimal sai com VÍRGULA, como o resto do app', () => {
        expect(formatMinutesLabel(114, { decimals: 1 })).toBe('1,9 min')
        expect(formatMinutesLabel(114, { decimals: 1 })).not.toContain('.')
    })

    it('entrada inválida não vira NaN na tela', () => {
        for (const v of [null, undefined, '', 'abc', NaN, -5, 0]) {
            expect(formatMinutesLabel(v)).toBe('0 min')
        }
    })

    it('aceita string numérica (o banco devolve numeric como string)', () => {
        expect(formatMinutesLabel('114')).toBe('2 min')
    })
})

describe('as quatro telas usam a fonte única', () => {
    const ler = (...p: string[]) => readFileSync(join(__dirname, '..', '..', '..', ...p), 'utf8')
    const executavel = (src: string) =>
        src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '')

    it('card do histórico', () => {
        const src = executavel(ler('components', 'HistoryList.tsx'))
        expect(src).toContain('formatMinutesLabel')
        expect(src, 'o Math.floor era metade da divergência')
            .not.toMatch(/Math\.floor\(\(Number\(session\?\.totalTime\) \|\| 0\) \/ 60\)/)
    })

    it('story', () => {
        const src = executavel(ler('components', 'storyComposerUtils.ts'))
        expect(src).toContain('formatMinutesLabel')
    })

    it('relatório — sem toFixed solto em campo de minuto', () => {
        const src = executavel(ler('components', 'workout-report', 'ReportMetricsPanel.tsx'))
        expect(src).toContain('formatMinutesLabel')
        expect(src, 'toFixed devolve PONTO; em pt-BR o separador é vírgula')
            .not.toMatch(/toFixed\(1\)\} min/)
    })

    it('a taxa kg/min também usa vírgula', () => {
        const src = executavel(ler('components', 'workout-report', 'ReportMetricsPanel.tsx'))
        expect(src).toMatch(/toFixed\(1\)\.replace\('\.', ','\)\} kg\/min/)
    })
})
