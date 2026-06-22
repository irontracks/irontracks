/**
 * Resolver anti-falhas de músculos por exercício.
 *
 * Fonte única da verdade = `exercise_library` (catálogo GLOBAL curado, com
 * primary_muscle/secondary_muscles na taxonomia pt-BR). Cadeia de fallback:
 *
 *   1) exercise_library por normalized_name        (curado, vetado)
 *   2) exercise_library por alias                   (curado)
 *   3) heurística (buildHeuristicExerciseMap)        + sinaliza buraco
 *   4) null                                          + sinaliza buraco
 *
 * Nunca lança e nunca "some" silenciosamente: o que cai no fallback é
 * reportado por `onGap` pra backfill posterior (auto-cura).
 */
import { buildHeuristicExerciseMap } from '@/utils/exerciseMuscleHeuristics'
import { normalizeExerciseName } from '@/utils/normalizeExerciseName'

export type LibRow = {
  normalized_name: string | null
  aliases: string[] | null
  primary_muscle: string | null
  secondary_muscles: string[] | null
}

export type ResolvedMuscles = {
  primary: string
  secondary: string[]
  source: 'library' | 'library_alias' | 'heuristic'
}

// Taxonomia fina (muscleMapConfig) → taxonomia do exercise_library (pt-BR).
const FINE_TO_LIB: Record<string, string> = {
  chest: 'peito', lats: 'costas', upper_back: 'costas',
  delts_front: 'ombros', delts_side: 'ombros', delts_rear: 'ombros_posteriores',
  biceps: 'biceps', triceps: 'triceps', forearms: 'antebraco',
  quads: 'quadriceps', hamstrings: 'posterior_de_coxa', glutes: 'gluteos',
  calves: 'panturrilhas', abs: 'abdomen', spinal_erectors: 'lombar',
}

/** Índice de busca: normalized_name e cada alias → linha do library (com músculo). */
export function buildLibraryIndex(rows: LibRow[]): Map<string, LibRow> {
  const idx = new Map<string, LibRow>()
  for (const r of rows) {
    if (!r.primary_muscle) continue
    const keys = [r.normalized_name || '', ...(r.aliases || [])]
    for (const k of keys) {
      const nk = normalizeExerciseName(String(k))
      if (nk && !idx.has(nk)) idx.set(nk, r)
    }
  }
  return idx
}

function fromHeuristic(name: string): ResolvedMuscles | null {
  const h = buildHeuristicExerciseMap(name)
  if (!h) return null
  const nn = normalizeExerciseName(name)
  const isShrug = nn.includes('encolhimento') || nn.includes('shrug') || nn.includes('trapezio')
  const mapId = (mid: string) => (mid === 'upper_back' && isShrug ? 'trapezio' : FINE_TO_LIB[mid])
  const prims = h.mapping.contributions.filter((c) => c.role === 'primary')
  const secs = h.mapping.contributions.filter((c) => c.role === 'secondary')
  const primary = prims[0] ? mapId(prims[0].muscleId) : undefined
  if (!primary) return null
  const secondary = [...new Set(secs.map((s) => mapId(s.muscleId)).filter(Boolean))].filter((m) => m !== primary)
  return { primary, secondary, source: 'heuristic' }
}

/**
 * Resolve os músculos de um exercício pelo nome. `index` vem de
 * buildLibraryIndex(linhas do exercise_library). `onGap` (opcional) é chamado
 * quando cai no fallback heurístico ou não resolve — pra logar/backfill.
 */
export function resolveExerciseMuscles(
  rawName: string,
  index: Map<string, LibRow>,
  onGap?: (name: string, via: 'heuristic' | 'unresolved') => void,
): ResolvedMuscles | null {
  const nn = normalizeExerciseName(rawName)
  if (!nn) return null

  const hit = index.get(nn)
  if (hit?.primary_muscle) {
    return {
      primary: hit.primary_muscle,
      secondary: (hit.secondary_muscles || []).filter(Boolean),
      source: normalizeExerciseName(String(hit.normalized_name || '')) === nn ? 'library' : 'library_alias',
    }
  }

  const heur = fromHeuristic(rawName)
  if (heur) { onGap?.(rawName, 'heuristic'); return heur }

  onGap?.(rawName, 'unresolved')
  return null
}
