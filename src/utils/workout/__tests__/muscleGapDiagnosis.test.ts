import { describe, it, expect } from 'vitest'
import { diagnoseMuscleGap } from '@/utils/workout/muscleGapDiagnosis'
import { coveragesForMuscle, missingEssentialPatterns } from '@/utils/workout/movementPatterns'

/**
 * Os três casos abaixo são REAIS, da mesma correlação (ago/2026), e têm
 * naturezas diferentes. Um botão "ajustar treino" que só soubesse adicionar
 * exercício acertaria um de três — e repetiria o viés "mais volume resolve" que
 * esta feature já produziu uma vez.
 *
 * Dados: 13 semanas de janela.
 *   posterior de coxa → 56 séries, TODAS de mesa flexora
 *   panturrilha       → 119 séries em 5 variações, desenvolvimento moderado
 *   abdômen           → 35 séries
 */
const WEEKS = 13

describe('diagnoseMuscleGap — o tipo de lacuna vem antes da sugestão', () => {
    it('posterior de coxa: 4,3 séries/sem e só flexão de joelho → falta PADRÃO, não volume', () => {
        const d = diagnoseMuscleGap({
            muscle: 'hamstrings',
            weeks: WEEKS,
            exercises: [{ name: 'Mesa flexora', sets: 55 }, { name: 'Flexora em pé', sets: 1 }],
            development: 'moderate',
        })
        expect(d.kind).toBe('missing_pattern')
        expect(d.missingPatterns.map((p) => p.id)).toEqual(['hip_extension'])
        expect(d.setsPerWeek).toBe(4.3)
        expect(d.suggestedWeeklySets).toBeGreaterThanOrEqual(3)
    })

    it('e some assim que entra um exercício de extensão de quadril', () => {
        const d = diagnoseMuscleGap({
            muscle: 'hamstrings',
            weeks: WEEKS,
            exercises: [{ name: 'Mesa flexora', sets: 55 }, { name: 'Stiff com barra', sets: 12 }],
            development: 'moderate',
        })
        expect(d.kind).not.toBe('missing_pattern')
        expect(d.missingPatterns).toEqual([])
    })

    it('panturrilha: 9,2 séries/sem, os dois padrões cobertos, físico moderado → EXECUÇÃO', () => {
        const d = diagnoseMuscleGap({
            muscle: 'calves',
            weeks: WEEKS,
            exercises: [
                { name: 'Panturrilha sentado', sets: 47 },
                { name: 'Panturrilha em pé', sets: 37 },
                { name: 'Panturrilha no leg press', sets: 16 },
                { name: 'Panturrilha no leg press horizontal', sets: 15 },
                { name: 'Panturrilha sentado sólio', sets: 4 },
            ],
            development: 'moderate',
        })
        expect(d.kind).toBe('technique')
        // o ponto do caso: mandar treinar MAIS seria o conselho errado
        expect(d.suggestedWeeklySets).toBe(0)
        expect(d.setsPerWeek).toBeGreaterThan(d.targetMin)
    })

    it('abdômen: 2,7 séries/sem abaixo da faixa → VOLUME', () => {
        const d = diagnoseMuscleGap({
            muscle: 'abs',
            weeks: WEEKS,
            exercises: [{ name: 'Abdominal infra', sets: 18 }, { name: 'Abdominal supra na máquina', sets: 17 }],
            development: 'moderate',
        })
        expect(d.kind).toBe('low_volume')
        expect(d.suggestedWeeklySets).toBe(d.targetMin)
    })

    it('grupo nunca treinado é falta de volume, não de padrão', () => {
        const d = diagnoseMuscleGap({ muscle: 'hamstrings', weeks: WEEKS, exercises: [], development: 'weak' })
        expect(d.kind).toBe('low_volume')
        expect(d.missingPatterns).toEqual([])
    })

    it('volume em dia, padrões cobertos e físico bom → nada a ajustar', () => {
        const d = diagnoseMuscleGap({
            muscle: 'quads',
            weeks: WEEKS,
            exercises: [{ name: 'Leg press 45°', sets: 80 }, { name: 'Cadeira extensora', sets: 57 }],
            development: 'excellent',
        })
        expect(d.kind).toBe('ok')
    })

    it('sem laudo, volume em dia e padrões cobertos não vira alarme', () => {
        const d = diagnoseMuscleGap({
            muscle: 'quads',
            weeks: WEEKS,
            exercises: [{ name: 'Agachamento', sets: 80 }, { name: 'Cadeira extensora', sets: 57 }],
            development: null,
        })
        expect(d.kind).toBe('ok')
    })
})

describe('coveragesForMuscle — casamento por nome em pt-BR', () => {
    it('reconhece as variações de extensão de quadril que o usuário digita', () => {
        for (const nome of ['Stiff com barra', 'Terra romeno', 'RDL com halteres', 'Levantamento terra', 'Bom dia com barra']) {
            const cov = coveragesForMuscle('hamstrings', [{ name: nome, sets: 3 }])
            expect(missingEssentialPatterns(cov).map((p) => p.id)).not.toContain('hip_extension')
        }
    })

    it('elevação pélvica conta pra GLÚTEO, não pra isquiotibial', () => {
        // Distinção que importa: no hip thrust o joelho fica fletido, encurtando o
        // isquiotibial — o movimento é dominante de glúteo. Aceitá-lo como extensão
        // de quadril de posterior faria o card parar de sugerir stiff pra quem só
        // faz elevação pélvica, que é justamente quem mais precisa.
        const hams = coveragesForMuscle('hamstrings', [{ name: 'Elevação pélvica', sets: 12 }])
        expect(missingEssentialPatterns(hams).map((p) => p.id)).toContain('hip_extension')

        const glut = coveragesForMuscle('glutes', [{ name: 'Elevação pélvica', sets: 12 }])
        expect(missingEssentialPatterns(glut).map((p) => p.id)).not.toContain('hip_extension')
    })

    it('separa panturrilha por posição do joelho — sóleo e gastrocnêmio não se substituem', () => {
        const soSentado = coveragesForMuscle('calves', [{ name: 'Panturrilha sentado', sets: 20 }])
        expect(missingEssentialPatterns(soSentado).map((p) => p.id)).toEqual(['knee_extended'])

        const soEmPe = coveragesForMuscle('calves', [{ name: 'Panturrilha em pé', sets: 20 }])
        expect(missingEssentialPatterns(soEmPe).map((p) => p.id)).toEqual(['knee_flexed'])
    })

    it('grupo sem padrões distintos não inventa lacuna', () => {
        expect(coveragesForMuscle('biceps', [{ name: 'Rosca direta', sets: 10 }])).toEqual([])
    })
})
