import { describe, it, expect } from 'vitest'
import {
    legendaDaDuracao,
    minutosForaDeSerie,
    rotuloDaVariacaoSemanal,
    QUEDA_PARA_SEMANA_LEVE,
} from '../reportLabels'

/**
 * Duas coisas que o relatório dizia errado, vistas no aparelho em 28/08/2026.
 * Nenhuma delas quebrava nada — as duas ensinavam o usuário a desconfiar dos
 * números, que é pior.
 */

describe('a conta da duração fecha', () => {
    it('nomeia o tempo que sobra — foi o caso real: 53 de duração, 10 de execução, 19 de descanso', () => {
        expect(minutosForaDeSerie(53, 10, 19)).toBe(24)
        expect(legendaDaDuracao(53, 10, 19)).toContain('24 min')
    })

    it('sem sobra, sem frase — explicação de lacuna inexistente é ruído', () => {
        expect(legendaDaDuracao(30, 10, 20)).toBe('')
        expect(legendaDaDuracao(30, 20, 20)).toBe('')
    })

    it('arredondamento não inventa "0 min"', () => {
        expect(minutosForaDeSerie(30.4, 20, 10)).toBe(0)
        expect(legendaDaDuracao(30.4, 20, 10)).toBe('')
    })

    it('duração ausente não vira legenda', () => {
        expect(legendaDaDuracao(null, 10, 19)).toBe('')
        expect(legendaDaDuracao(0, 10, 19)).toBe('')
    })

    it('execução/descanso ausentes contam como zero, não quebram a conta', () => {
        expect(minutosForaDeSerie(50, null, undefined)).toBe(50)
    })
})

describe('o rótulo da variação semanal não se contradiz', () => {
    it('NÃO chama de "normal" uma queda de 100% — era o que a tela fazia', () => {
        const r = rotuloDaVariacaoSemanal({ deltaPct: -100, isHeavyWeek: false, previousWeekKg: 46491 })
        expect(r).toBe('semana mais leve')
        expect(r).not.toBe('semana normal')
    })

    it('semana pesada continua pesada', () => {
        expect(rotuloDaVariacaoSemanal({ deltaPct: 35, isHeavyWeek: true, previousWeekKg: 1000 })).toBe('semana pesada')
    })

    it('variação pequena é normal, nos dois sentidos', () => {
        expect(rotuloDaVariacaoSemanal({ deltaPct: -5, isHeavyWeek: false, previousWeekKg: 1000 })).toBe('semana normal')
        expect(rotuloDaVariacaoSemanal({ deltaPct: 8, isHeavyWeek: false, previousWeekKg: 1000 })).toBe('semana normal')
    })

    it('a fronteira do "mais leve" é a declarada', () => {
        expect(rotuloDaVariacaoSemanal({ deltaPct: QUEDA_PARA_SEMANA_LEVE, isHeavyWeek: false, previousWeekKg: 1000 })).toBe('semana mais leve')
        expect(rotuloDaVariacaoSemanal({ deltaPct: QUEDA_PARA_SEMANA_LEVE + 1, isHeavyWeek: false, previousWeekKg: 1000 })).toBe('semana normal')
    })

    it('sem semana anterior não afirma estabilidade — o delta vem 0 e 0 não foi medido', () => {
        expect(rotuloDaVariacaoSemanal({ deltaPct: 0, isHeavyWeek: false, previousWeekKg: 0 })).toBe('sem semana anterior')
        expect(rotuloDaVariacaoSemanal({ deltaPct: 0, isHeavyWeek: false, previousWeekKg: null })).toBe('sem semana anterior')
    })
})
