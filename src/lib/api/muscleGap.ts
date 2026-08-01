/**
 * Client wrapper do card "Ajustar treino" (POST /api/workout/muscle-gap).
 *
 * A rota NÃO chama IA: devolve diagnóstico de regra pura sobre o treino real e
 * sugestões vindas do catálogo de exercícios. Por isso não há tratamento de
 * erro de IA aqui — os erros possíveis são de rede/permissão.
 */

export type MuscleGapKind = 'missing_pattern' | 'low_volume' | 'technique' | 'ok'

export interface MuscleGapPattern {
    id: string
    label: string
    why: string
}

export interface MuscleGapCoverage {
    patternId: string
    patternLabel: string
    sets: number
    exercises: string[]
}

export interface MuscleGapDiagnosisDto {
    kind: MuscleGapKind
    muscle: string
    muscleLabel: string
    setsPerWeek: number
    targetMin: number
    targetMax: number
    suggestedWeeklySets: number
    missingPatterns: MuscleGapPattern[]
    coverages: MuscleGapCoverage[]
}

export interface MuscleGapSuggestion {
    name: string
    equipment: string[]
    videoUrl: string | null
    patternId: string
    patternLabel: string
    why: string
}

/**
 * Restrição declarada pelo aluno, quando ela toca as sugestões deste grupo.
 * `excluded` são os exercícios que o texto NOMEIA — já removidos da lista.
 * O texto vai junto porque o que a regra não consegue decidir, a pessoa decide.
 */
export interface MuscleGapRestriction {
    text: string
    excluded: string[]
}

export interface MuscleGapResponse {
    ok: boolean
    diagnosis?: MuscleGapDiagnosisDto
    suggestions?: MuscleGapSuggestion[]
    techniqueCues?: string[]
    restriction?: MuscleGapRestriction | null
    windowWeeks?: number
    error?: string
}

export async function fetchMuscleGap(assessmentId: string, muscleLabel: string): Promise<MuscleGapResponse> {
    try {
        const res = await fetch('/api/workout/muscle-gap', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ assessmentId, muscleLabel }),
        })
        const json = await res.json().catch(() => ({ ok: false, error: 'invalid_response' }))
        if (!res.ok || !json.ok) return { ok: false, error: json.error || 'Falha ao analisar o grupo.' }
        return {
            ok: true,
            diagnosis: json.diagnosis as MuscleGapDiagnosisDto,
            suggestions: (json.suggestions ?? []) as MuscleGapSuggestion[],
            techniqueCues: (json.techniqueCues ?? []) as string[],
            restriction: (json.restriction ?? null) as MuscleGapRestriction | null,
            windowWeeks: Number(json.windowWeeks) || 0,
        }
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : 'Erro de rede.' }
    }
}
