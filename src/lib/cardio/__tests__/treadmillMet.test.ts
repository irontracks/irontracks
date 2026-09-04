import { describe, it, expect } from 'vitest'
import { metDeEsteira, kcalDoBloco } from '../treadmillMet'

/**
 * As equações do ACSM são conferidas contra o Compendium of Physical Activities
 * (2011) — a mesma fonte da tabela por modalidade que elas substituem na
 * esteira. Se as duas divergissem muito, uma das duas estaria errada.
 */
describe('MET de esteira bate com o Compendium', () => {
    it.each([
        [4.0, 3.0, 0.6],   // walking 4 km/h ≈ 3.0
        [5.0, 3.5, 0.6],   // walking 4.8 km/h ≈ 3.5
        [6.0, 4.3, 0.8],   // walking 5.6 km/h ≈ 4.3
        [10.0, 9.8, 1.0],  // running 9.7 km/h ≈ 9.8
        [12.0, 11.0, 1.5], // running 11.3 km/h ≈ 11.0
    ])('%s km/h no plano ≈ %s MET', (kmh, esperado, tolerancia) => {
        const met = metDeEsteira(kmh, 0)
        expect(met).not.toBeNull()
        expect(Math.abs((met as number) - esperado)).toBeLessThanOrEqual(tolerancia)
    })

    it('velocidade maior gasta mais — o defeito que motivou o módulo', () => {
        // A tabela antiga dava o MESMO MET para 4 e 10 km/h no mesmo RPE.
        const lento = metDeEsteira(4, 0) as number
        const rapido = metDeEsteira(10, 0) as number
        expect(rapido).toBeGreaterThan(lento * 2)
    })

    it('inclinação aumenta o gasto, e bastante', () => {
        const plano = metDeEsteira(5, 0) as number
        const subida = metDeEsteira(5, 10) as number
        expect(subida).toBeGreaterThan(plano * 1.8)
    })

    it('sem inclinação informada assume plano, não desiste', () => {
        expect(metDeEsteira(5, null)).toBeCloseTo(metDeEsteira(5, 0) as number, 5)
        expect(metDeEsteira(5, undefined)).not.toBeNull()
        expect(metDeEsteira(5, '')).not.toBeNull()
    })
})

describe('recusa entrada que não dá para usar', () => {
    it.each([[null], [undefined], [''], ['abc'], [0], [-3], [999]])(
        'velocidade %s devolve null (o chamador cai na tabela por modalidade)',
        (v) => { expect(metDeEsteira(v as unknown)).toBeNull() },
    )
})

describe('kcal do bloco', () => {
    it('30 min caminhando a 5 km/h, 80 kg, dá algo plausível', () => {
        const met = metDeEsteira(5, 0) as number
        const kcal = kcalDoBloco(met, 80, 30)
        expect(kcal).toBeGreaterThan(110)
        expect(kcal).toBeLessThan(165)
    })

    it('entrada inválida não vira caloria fantasma', () => {
        expect(kcalDoBloco(0, 80, 30)).toBe(0)
        expect(kcalDoBloco(5, 0, 30)).toBe(0)
        expect(kcalDoBloco(5, 80, 0)).toBe(0)
        expect(kcalDoBloco(NaN, 80, 30)).toBe(0)
    })
})
