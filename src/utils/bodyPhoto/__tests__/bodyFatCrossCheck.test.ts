import { describe, it, expect } from 'vitest'
import { compareBodyFat, pickBodyFatReference } from '@/utils/bodyPhoto/bodyFatCrossCheck'

/**
 * O caso real que originou a feature (dados do dono, ago/2026):
 *   foto (IA, 31/07): 14–17%
 *   dobras (05/06):   7,07%
 * Sete pontos de diferença que ninguém via, porque cada número morava numa tela.
 */
describe('pickBodyFatReference — qual avaliação serve de referência', () => {
    const rows = [
        { assessment_date: '2026-06-05', body_fat_percentage: 7.07, body_fat_percentage_skinfold: 7.07, bia_body_fat_percentage: null },
        { assessment_date: '2025-03-20', body_fat_percentage: 9.98, body_fat_percentage_skinfold: null, bia_body_fat_percentage: null },
        { assessment_date: '2024-09-19', body_fat_percentage: 11.27, body_fat_percentage_skinfold: null, bia_body_fat_percentage: null },
    ]

    it('pega a mais recente ATÉ a data da foto', () => {
        const ref = pickBodyFatReference(rows, '2026-07-31')
        expect(ref?.assessmentDate).toBe('2026-06-05')
        expect(ref?.percent).toBeCloseTo(7.07)
        expect(ref?.source).toBe('skinfold')
        expect(ref?.daysApart).toBe(56)
    })

    it('ignora avaliação posterior quando existe uma anterior', () => {
        const comFuturo = [...rows, { assessment_date: '2026-12-01', body_fat_percentage: 5, body_fat_percentage_skinfold: 5, bia_body_fat_percentage: null }]
        expect(pickBodyFatReference(comFuturo, '2026-07-31')?.assessmentDate).toBe('2026-06-05')
    })

    it('sem nenhuma anterior, aceita a posterior mais próxima', () => {
        const soFuturo = [{ assessment_date: '2026-09-01', body_fat_percentage: 8, body_fat_percentage_skinfold: 8, bia_body_fat_percentage: null }]
        expect(pickBodyFatReference(soFuturo, '2026-07-31')?.assessmentDate).toBe('2026-09-01')
    })

    it('prefere dobras; cai pra bioimpedância e depois pro consolidado — sem mentir a fonte', () => {
        expect(pickBodyFatReference([{ assessment_date: '2026-07-01', body_fat_percentage: 12, body_fat_percentage_skinfold: 10, bia_body_fat_percentage: 11 }], '2026-07-31')?.source).toBe('skinfold')
        expect(pickBodyFatReference([{ assessment_date: '2026-07-01', body_fat_percentage: 12, body_fat_percentage_skinfold: null, bia_body_fat_percentage: 11 }], '2026-07-31')?.source).toBe('bia')
        expect(pickBodyFatReference([{ assessment_date: '2026-07-01', body_fat_percentage: 12, body_fat_percentage_skinfold: null, bia_body_fat_percentage: null }], '2026-07-31')?.source).toBe('assessment')
    })

    it('descarta valores impossíveis em vez de exibir lixo', () => {
        expect(pickBodyFatReference([{ assessment_date: '2026-07-01', body_fat_percentage: 0, body_fat_percentage_skinfold: null, bia_body_fat_percentage: null }], '2026-07-31')).toBeNull()
        expect(pickBodyFatReference([{ assessment_date: '2026-07-01', body_fat_percentage: 120, body_fat_percentage_skinfold: null, bia_body_fat_percentage: null }], '2026-07-31')).toBeNull()
        expect(pickBodyFatReference([], '2026-07-31')).toBeNull()
    })
})

describe('compareBodyFat — a faixa da foto contra o valor medido', () => {
    const ref = (percent: number, daysApart = 10) => ({ assessmentDate: '2026-06-05', percent, source: 'skinfold' as const, daysApart })

    it('medido DENTRO da faixa = os dois métodos concordam', () => {
        const r = compareBodyFat(14, 17, ref(15.5))
        expect(r.verdict).toBe('match')
        expect(r.deltaPoints).toBe(0)
        expect(r.severity).toBe('ok')
    })

    it('borda conta como acordo (14–17 com 14,0 medido)', () => {
        expect(compareBodyFat(14, 17, ref(14)).verdict).toBe('match')
        expect(compareBodyFat(14, 17, ref(17)).verdict).toBe('match')
    })

    it('o caso real: foto 14–17% vs dobras 7,07% → divergência alta', () => {
        const r = compareBodyFat(14, 17, ref(7.07))
        expect(r.verdict).toBe('photo_higher')
        expect(r.deltaPoints).toBe(6.9)   // distância até a BORDA (14), não até o meio
        expect(r.severity).toBe('high')
    })

    it('mede a distância até a borda, não até o centro da faixa', () => {
        // Medido 12 contra faixa 14–17: 2 pontos da borda, não 3,5 do meio.
        expect(compareBodyFat(14, 17, ref(12)).deltaPoints).toBe(2)
    })

    it('gradua a severidade em vez de alarmar por qualquer diferença', () => {
        expect(compareBodyFat(14, 17, ref(12.5)).severity).toBe('ok')        // 1,5 pt
        expect(compareBodyFat(14, 17, ref(10.5)).severity).toBe('attention') // 3,5 pt
        expect(compareBodyFat(14, 17, ref(8)).severity).toBe('high')         // 6 pt
    })

    it('foto abaixo do medido também é divergência', () => {
        const r = compareBodyFat(10, 12, ref(20))
        expect(r.verdict).toBe('photo_lower')
        expect(r.deltaPoints).toBe(8)
    })

    it('marca referência velha — o tempo explica parte da diferença sozinho', () => {
        expect(compareBodyFat(14, 17, ref(7, 200)).stale).toBe(true)
        expect(compareBodyFat(14, 17, ref(7, 30)).stale).toBe(false)
    })

    it('aceita faixa invertida sem quebrar', () => {
        expect(compareBodyFat(17, 14, ref(15)).verdict).toBe('match')
    })
})
