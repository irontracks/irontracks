/**
 * A fórmula de BMR/TDEE mora num lugar só.
 *
 * Estava escrita duas vezes — `utils/calculations/bodyComposition.ts`
 * (avaliação física) e `lib/nutrition/goals.ts` (metas de nutrição) — com os
 * mesmos coeficientes. Auditoria de 23/08/2026: as duas concordavam, divergindo
 * só no arredondamento (2 casas × inteiro) e no vocabulário de sexo, então
 * nenhum usuário viu número errado. É a duplicação que não quebra nada hoje e
 * diverge no dia em que alguém ajustar um coeficiente de um lado só.
 *
 * As duas APIs de domínio continuam existindo, com as assinaturas que seus
 * chamadores usam. O que este arquivo trava é que a CONTA não volte a ser
 * escrita à mão.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { basalMetabolicRate, totalDailyEnergyExpenditure } from '../mifflinStJeor'
import { calculateBMR as bmrAvaliacao, calculateTDEE as tdeeAvaliacao } from '@/utils/calculations/bodyComposition'
import { calculateBMR as bmrNutricao, calculateTDEE as tdeeNutricao } from '@/lib/nutrition/goals'

describe('Mifflin-St Jeor', () => {
    it('homem 80 kg, 178 cm, 35 anos → 1.743 kcal', () => {
        // 10×80 + 6.25×178 − 5×35 + 5 = 800 + 1112,5 − 175 + 5 = 1742,5 → 1743
        expect(basalMetabolicRate({ weightKg: 80, heightCm: 178, ageYears: 35, sex: 'M' })).toBe(1743)
    })

    it('mulher 60 kg, 165 cm, 30 anos → 1.320 kcal', () => {
        // 10×60 + 6.25×165 − 5×30 − 161 = 600 + 1031,25 − 150 − 161 = 1320,25 → 1320
        expect(basalMetabolicRate({ weightKg: 60, heightCm: 165, ageYears: 30, sex: 'F' })).toBe(1320)
    })

    it('aceita os dois vocabulários de sexo do app', () => {
        const p = { weightKg: 80, heightCm: 178, ageYears: 35 } as const
        expect(basalMetabolicRate({ ...p, sex: 'M' })).toBe(basalMetabolicRate({ ...p, sex: 'MALE' }))
        expect(basalMetabolicRate({ ...p, sex: 'F' })).toBe(basalMetabolicRate({ ...p, sex: 'FEMALE' }))
    })

    it('entrada impossível devolve null em vez de número inventado', () => {
        expect(basalMetabolicRate({ weightKg: 0, heightCm: 178, ageYears: 35, sex: 'M' })).toBeNull()
        expect(basalMetabolicRate({ weightKg: 80, heightCm: -1, ageYears: 35, sex: 'M' })).toBeNull()
        expect(basalMetabolicRate({ weightKg: 80, heightCm: 178, ageYears: NaN, sex: 'M' })).toBeNull()
    })

    it('TDEE = BMR × fator', () => {
        expect(totalDailyEnergyExpenditure(1743, 1.55)).toBe(2702)
        expect(totalDailyEnergyExpenditure(1743, 0)).toBeNull()
        expect(totalDailyEnergyExpenditure(0, 1.55)).toBeNull()
    })
})

describe('as duas superfícies concordam — era o ponto da unificação', () => {
    const casos = [
        { w: 80, h: 178, a: 35 },
        { w: 60, h: 165, a: 30 },
        { w: 94.6, h: 181, a: 39 },
        { w: 120, h: 190, a: 55 },
    ]

    it('avaliação física e nutrição dão o MESMO BMR', () => {
        for (const { w, h, a } of casos) {
            expect(bmrAvaliacao(w, h, a, 'M'), `M ${w}/${h}/${a}`)
                .toBe(bmrNutricao({ weight: w, height: h, age: a, gender: 'MALE', activityLevel: 'MODERATE' }))
            expect(bmrAvaliacao(w, h, a, 'F'), `F ${w}/${h}/${a}`)
                .toBe(bmrNutricao({ weight: w, height: h, age: a, gender: 'FEMALE', activityLevel: 'MODERATE' }))
        }
    })

    it('e o mesmo TDEE para o mesmo fator', () => {
        const stats = { weight: 80, height: 178, age: 35, gender: 'MALE', activityLevel: 'MODERATE' } as const
        const bmr = bmrNutricao(stats)
        expect(tdeeAvaliacao(bmr, 1.55)).toBe(tdeeNutricao(stats))
    })

    it('a nutrição mantém os erros TIPADOS por campo (a UI depende deles)', () => {
        const base = { weight: 80, height: 178, age: 35, gender: 'MALE', activityLevel: 'MODERATE' } as const
        expect(() => bmrNutricao({ ...base, weight: 0 })).toThrow('nutrition_invalid_weight')
        expect(() => bmrNutricao({ ...base, height: 0 })).toThrow('nutrition_invalid_height')
        expect(() => bmrNutricao({ ...base, age: 0 })).toThrow('nutrition_invalid_age')
    })

    it('a avaliação mantém o throw que o fluxo dela espera', () => {
        expect(() => bmrAvaliacao(0, 178, 35, 'M')).toThrow(/maiores que zero/)
        expect(() => tdeeAvaliacao(1743, 0)).toThrow(/maiores que zero/)
    })
})

describe('guard: a fórmula não volta a ser escrita à mão', () => {
    it('os coeficientes de Mifflin-St Jeor só aparecem no núcleo', () => {
        const suspeitos = [
            'src/utils/calculations/bodyComposition.ts',
            'src/lib/nutrition/goals.ts',
            'src/lib/nutrition/engine.ts',
        ]
        // O par que identifica a equação: 6.25 × altura e o offset de sexo.
        for (const rel of suspeitos) {
            const code = readFileSync(join(process.cwd(), rel), 'utf8')
                .replace(/\/\*[\s\S]*?\*\//g, '')
                .replace(/^[ \t]*\/\/.*$/gm, '')
            expect(code, `${rel} deve delegar ao núcleo`).not.toMatch(/6\.25\s*\*/)
        }
        const nucleo = readFileSync(join(process.cwd(), 'src/lib/health/mifflinStJeor.ts'), 'utf8')
        expect(nucleo).toMatch(/6\.25 \* height/)
    })
})
