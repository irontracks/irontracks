/**
 * Ponte entre os DOIS vocabulários de músculo que convivem no banco.
 *
 * `exercise_library.primary_muscle` usa nomes em pt-BR sem acento
 * ('posterior_de_coxa', 'quadriceps'), enquanto `MUSCLE_GROUPS` e o
 * `contributions.muscleId` usam ids em inglês ('hamstrings', 'quads'). Sem esta
 * tradução não dá pra buscar candidatos no catálogo a partir do grupo que a
 * correlação apontou.
 *
 * Terceira entrada: o rótulo em português que a IA devolve no `links[].muscleGroup`
 * da correlação ("Posterior", "Panturrilhas") — texto livre, então o casamento é
 * por normalização e prefixo, com fallback silencioso pra null.
 */

import type { MuscleId } from '@/utils/muscleMapConfig'

/** `exercise_library.primary_muscle` → MuscleId. */
export const LIBRARY_MUSCLE_TO_ID: Record<string, MuscleId> = {
    posterior_de_coxa: 'hamstrings',
    quadriceps: 'quads',
    gluteos: 'glutes',
    panturrilhas: 'calves',
    abdomen: 'abs',
    core: 'abs',
    peito: 'chest',
    costas: 'lats',
    trapezio: 'upper_back',
    lombar: 'spinal_erectors',
    ombros: 'delts_side',
    ombros_posteriores: 'delts_rear',
    biceps: 'biceps',
    triceps: 'triceps',
    antebraco: 'forearms',
}

/** MuscleId → valores de `primary_muscle` que representam esse grupo no catálogo. */
export const ID_TO_LIBRARY_MUSCLES: Partial<Record<MuscleId, string[]>> = Object.entries(
    LIBRARY_MUSCLE_TO_ID,
).reduce<Partial<Record<MuscleId, string[]>>>((acc, [lib, id]) => {
    acc[id] = [...(acc[id] ?? []), lib]
    return acc
}, {})

const normalize = (raw: unknown): string =>
    String(raw ?? '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()

/**
 * Rótulo em português (livre, vindo da IA) → MuscleId.
 * A ordem importa: 'posterior de coxa' tem que ser testado antes de 'posterior',
 * senão "Posterior" (que na correlação significa isquiotibial) cairia em deltoide.
 */
const LABEL_PATTERNS: Array<[RegExp, MuscleId]> = [
    [/posterior de coxa|isquiotibiais|isquiotibial|hamstring/, 'hamstrings'],
    [/quadriceps|quadricipes/, 'quads'],
    [/gluteo/, 'glutes'],
    [/panturrilha|triceps sural|solear|gastrocnemio/, 'calves'],
    [/abdomen|abdominal|core/, 'abs'],
    [/peitoral|peito/, 'chest'],
    [/dorsal|latissimo/, 'lats'],
    [/costas superior|trapezio|romboide/, 'upper_back'],
    [/costas/, 'lats'],
    [/eretores|lombar/, 'spinal_erectors'],
    [/deltoide posterior|ombro posterior/, 'delts_rear'],
    [/deltoide lateral|ombro lateral/, 'delts_side'],
    [/deltoide frontal|deltoide anterior|ombro anterior/, 'delts_front'],
    [/posterior/, 'hamstrings'],   // convenção do app: "Posterior" sozinho = coxa
    [/ombro|deltoide/, 'delts_side'],
    [/biceps/, 'biceps'],
    [/triceps/, 'triceps'],
    [/antebraco/, 'forearms'],
]

/** Resolve o rótulo da correlação para um MuscleId. Devolve null quando não reconhece. */
export function muscleIdFromLabel(label: unknown): MuscleId | null {
    const text = normalize(label)
    if (!text) return null
    for (const [pattern, id] of LABEL_PATTERNS) {
        if (pattern.test(text)) return id
    }
    return null
}

/** Resolve `exercise_library.primary_muscle` para MuscleId. */
export function muscleIdFromLibrary(primaryMuscle: unknown): MuscleId | null {
    const key = String(primaryMuscle ?? '').trim().toLowerCase()
    return LIBRARY_MUSCLE_TO_ID[key] ?? null
}
