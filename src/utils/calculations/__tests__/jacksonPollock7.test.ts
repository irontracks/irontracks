/**
 * O protocolo das dobras: a equação e as entradas têm que ser do MESMO lugar.
 *
 * Achado na varredura das áreas de cálculo (23/08/2026). `calculateBodyDensity`
 * usa as constantes de **Jackson & Pollock 7 dobras** e a tela anuncia "Pollock
 * 7 dobras" — mas a soma trocava **peitoral** e **axilar média** por **bíceps**
 * e **panturrilha**. Equação de um protocolo com as entradas de outro não
 * devolve o número de nenhum dos dois.
 *
 * O que provou que não era escolha deliberada: o banco TEM as colunas
 * `pectoral_skinfold`/`midaxillary_skinfold`, **6 das 9 avaliações as têm
 * preenchidas** com o protocolo completo, e nenhum código as lia — era o
 * formulário antigo, que media certo. Os `%BF` gravados por aquela versão
 * batem com a soma correta, e é isso que os casos abaixo travam.
 */
import { describe, it, expect } from 'vitest'
import {
    JP7_SKINFOLD_FIELDS,
    sumSkinfoldsJP7,
    calculateBodyDensity,
    calculateBodyFatPercentage,
} from '../bodyComposition'

/** Caso real do banco (F, 37 anos) — `body_fat_percentage_skinfold` = 16.82. */
const REAL_F37 = {
    pectoral_skinfold: 6,
    midaxillary_skinfold: 5,
    triceps_skinfold: 10,
    subscapular_skinfold: 12,
    abdominal_skinfold: 15,
    suprailiac_skinfold: 9,
    thigh_skinfold: 17.5,
}
/** Caso real do banco (M, 40 anos) — `body_fat_percentage_skinfold` = 7.07. */
const REAL_M40 = {
    pectoral_skinfold: 1,
    midaxillary_skinfold: 5,
    triceps_skinfold: 2,
    subscapular_skinfold: 14,
    abdominal_skinfold: 9,
    suprailiac_skinfold: 5,
    thigh_skinfold: 6.5,
}

const bf = (dobras: Record<string, number>, age: number, g: 'M' | 'F') => {
    const sum = sumSkinfoldsJP7(dobras)!
    return calculateBodyFatPercentage(calculateBodyDensity(sum, age, g))
}

describe('as 7 dobras são as do protocolo', () => {
    it('inclui peitoral e axilar média; exclui bíceps e panturrilha', () => {
        expect(JP7_SKINFOLD_FIELDS).toEqual([
            'pectoral_skinfold',
            'midaxillary_skinfold',
            'triceps_skinfold',
            'subscapular_skinfold',
            'abdominal_skinfold',
            'suprailiac_skinfold',
            'thigh_skinfold',
        ])
        // As duas que entravam no lugar das certas — são acompanhamento, não entram.
        expect(JP7_SKINFOLD_FIELDS).not.toContain('biceps_skinfold')
        expect(JP7_SKINFOLD_FIELDS).not.toContain('calf_skinfold')
    })

    it('bíceps e panturrilha não mexem no resultado', () => {
        const semExtras = sumSkinfoldsJP7(REAL_F37)
        const comExtras = sumSkinfoldsJP7({ ...REAL_F37, biceps_skinfold: 8, calf_skinfold: 15 })
        expect(comExtras).toBe(semExtras)
    })
})

describe('reproduz os laudos reais gravados no banco', () => {
    it('mulher, 37 anos → 16,82%', () => {
        expect(sumSkinfoldsJP7(REAL_F37)).toBe(74.5)
        expect(bf(REAL_F37, 37, 'F')).toBeCloseTo(16.82, 2)
    })

    it('homem, 40 anos → 7,07%', () => {
        expect(sumSkinfoldsJP7(REAL_M40)).toBe(42.5)
        expect(bf(REAL_M40, 40, 'M')).toBeCloseTo(7.07, 2)
    })

    it('o conjunto ERRADO produzia gordura MENOR — o dano medido', () => {
        // Sem peitoral/axilar e com bíceps/panturrilha ausentes (o caso real:
        // `?? 0` transformava as que faltavam em zero).
        const somaAntiga = 10 + 0 + 12 + 9 + 15 + 17.5 + 0 // 63.5
        const bfAntigo = calculateBodyFatPercentage(calculateBodyDensity(somaAntiga, 37, 'F'))
        expect(bfAntigo).toBeCloseTo(14.93, 2)
        expect(bf(REAL_F37, 37, 'F') - bfAntigo).toBeGreaterThan(1.8)
    })
})

describe('dobra faltando NÃO vira zero', () => {
    it('devolve null em vez de somar seis e chamar de sete', () => {
        for (const field of JP7_SKINFOLD_FIELDS) {
            const incompleto: Record<string, number> = { ...REAL_F37 }
            delete incompleto[field]
            expect(sumSkinfoldsJP7(incompleto), `sem ${field}`).toBeNull()
        }
    })

    it('zero e valor inválido contam como ausente', () => {
        expect(sumSkinfoldsJP7({ ...REAL_F37, thigh_skinfold: 0 })).toBeNull()
        expect(sumSkinfoldsJP7({ ...REAL_F37, thigh_skinfold: NaN })).toBeNull()
        expect(sumSkinfoldsJP7({})).toBeNull()
    })
})

describe('guard: quem soma dobras usa a lista canônica', () => {
    it('nenhum consumidor remonta o conjunto à mão', async () => {
        const { readFileSync } = await import('node:fs')
        const { join } = await import('node:path')
        const arquivos = [
            'src/components/assessment/ResultsPreview.tsx',
            'src/components/assessment/AssessmentPDFGenerator.tsx',
            'src/hooks/useAssessment.ts',
            'src/components/assessment/assessmentUtils.ts',
        ]
        for (const rel of arquivos) {
            const code = readFileSync(join(process.cwd(), rel), 'utf8')
                .replace(/\/\*[\s\S]*?\*\//g, '')
                .replace(/^[ \t]*\/\/.*$/gm, '')
            expect(code, `${rel} deve usar a fonte única`).toMatch(/sumSkinfoldsJP7|JP7_SKINFOLD_FIELDS/)
            // Mira a FONTE, não o nome do campo: `biceps_skinfold` é legítimo no
            // mapeamento da linha e no payload de gravação (a medida continua
            // sendo guardada) — a 1ª versão deste guard reprovava justamente o
            // consumo correto. O defeito é bíceps/panturrilha DENTRO do argumento
            // que vira soma.
            for (const m of code.matchAll(/sumSkinfoldsJP7\(\s*\{([\s\S]*?)\}\s*\)/g)) {
                expect(m[1], `${rel}: bíceps/panturrilha dentro da soma`).not.toMatch(/biceps_skinfold|calf_skinfold/)
            }
        }
    })
})
