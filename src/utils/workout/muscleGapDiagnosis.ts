/**
 * Diagnóstico de lacuna por grupo muscular — decide QUE TIPO de ajuste o grupo
 * precisa, antes de sugerir qualquer coisa.
 *
 * Existe porque "pouco treinado" não tem uma resposta só. Na mesma correlação
 * (ago/2026) apareceram três problemas de naturezas diferentes:
 *   - posterior de coxa: 56 séries, todas de flexão de joelho → falta PADRÃO;
 *   - panturrilha: 84 séries e desenvolvimento moderado → é EXECUÇÃO;
 *   - abdômen: 2,7 séries/semana → falta VOLUME.
 *
 * Um botão "ajustar treino" que só soubesse adicionar exercício acertaria um de
 * três — e repetiria o viés "mais volume resolve" que já produziu conselho
 * errado nesta feature. Por isso o tipo vem primeiro e o conteúdo depois.
 */

import { MUSCLE_BY_ID, type MuscleId } from '@/utils/muscleMapConfig'
import {
    coveragesForMuscle,
    missingEssentialPatterns,
    type MovementPattern,
    type PatternCoverage,
} from '@/utils/workout/movementPatterns'

export type GapKind =
    /** Falta um padrão essencial — volume novo no mesmo movimento não resolve. */
    | 'missing_pattern'
    /** Todos os padrões presentes, mas abaixo da faixa semanal. */
    | 'low_volume'
    /** Volume dentro da faixa e desenvolvimento ainda fraco — o gargalo é execução. */
    | 'technique'
    /** Nada a ajustar. */
    | 'ok'

/** Como o laudo por foto classificou o grupo. */
export type DevelopmentLevel = 'weak' | 'moderate' | 'good' | 'excellent'

export interface MuscleGapInput {
    muscle: MuscleId
    /** Exercícios do grupo treinados na janela, com séries somadas. */
    exercises: ReadonlyArray<{ name: string; sets: number }>
    /** Semanas cobertas pela janela (para converter séries totais em séries/semana). */
    weeks: number
    /** Desenvolvimento do laudo, quando existir. */
    development?: DevelopmentLevel | null
}

export interface MuscleGapDiagnosis {
    kind: GapKind
    muscle: MuscleId
    muscleLabel: string
    setsPerWeek: number
    targetMin: number
    targetMax: number
    coverages: PatternCoverage[]
    /** Padrões essenciais ausentes — vazio quando kind !== 'missing_pattern'. */
    missingPatterns: MovementPattern[]
    /** Séries/semana sugeridas para fechar a lacuna. 0 quando não é caso de volume. */
    suggestedWeeklySets: number
}

const round1 = (n: number) => Math.round(n * 10) / 10

/** Dose inicial de um padrão que está zerado: um terço da faixa, nunca menos de 3. */
const startingSetsFor = (targetMin: number) => Math.max(3, Math.round(targetMin / 3))

export function diagnoseMuscleGap(input: MuscleGapInput): MuscleGapDiagnosis {
    const cfg = MUSCLE_BY_ID[input.muscle]
    const weeks = Math.max(1, Number(input.weeks) || 1)
    const totalSets = input.exercises.reduce((acc, e) => acc + (Number(e.sets) || 0), 0)
    const setsPerWeek = round1(totalSets / weeks)
    const coverages = coveragesForMuscle(input.muscle, input.exercises)
    const missingPatterns = missingEssentialPatterns(coverages)

    const base = {
        muscle: input.muscle,
        muscleLabel: cfg?.label ?? String(input.muscle),
        setsPerWeek,
        targetMin: cfg?.minSets ?? 0,
        targetMax: cfg?.maxSets ?? 0,
        coverages,
    }

    // 1. Padrão essencial ausente vence tudo: o grupo pode até estar com volume
    //    alto, mas metade da função dele não está sendo treinada.
    //    Só vale quando o grupo já é treinado — grupo zerado é falta de volume.
    if (missingPatterns.length && totalSets > 0) {
        return {
            ...base,
            kind: 'missing_pattern',
            missingPatterns,
            suggestedWeeklySets: startingSetsFor(base.targetMin),
        }
    }

    // 2. Abaixo da faixa semanal → volume.
    if (base.targetMin > 0 && setsPerWeek < base.targetMin) {
        return {
            ...base,
            kind: 'low_volume',
            missingPatterns: [],
            suggestedWeeklySets: base.targetMin,
        }
    }

    // 3. Volume em dia, padrões cobertos e o físico não acompanha → execução.
    if (input.development === 'weak' || input.development === 'moderate') {
        return { ...base, kind: 'technique', missingPatterns: [], suggestedWeeklySets: 0 }
    }

    return { ...base, kind: 'ok', missingPatterns: [], suggestedWeeklySets: 0 }
}
