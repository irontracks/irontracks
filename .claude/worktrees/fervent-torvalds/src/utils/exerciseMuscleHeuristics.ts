import { normalizeExerciseName } from '@/utils/normalizeExerciseName'
import type { MuscleId } from '@/utils/muscleMapConfig'

type Contribution = { muscleId: MuscleId; weight: number; role: 'primary' | 'secondary' | 'stabilizer' }

export type HeuristicExerciseMap = {
  exercise_key: string
  canonical_name: string
  mapping: {
    contributions: Contribution[]
    unilateral: boolean
    confidence: number
    notes: string
  }
  confidence: number
  source: 'heuristic'
}

const detect = (normalized: string, tokens: string[]) => tokens.some((t) => normalized.includes(t))

export function buildHeuristicExerciseMap(canonicalName: string): HeuristicExerciseMap | null {
  const raw = String(canonicalName || '').trim()
  if (!raw) return null
  const key = normalizeExerciseName(raw)
  if (!key) return null

  const n = key
  const match = (tokens: string[]) => detect(n, tokens)

  const isCalves =
    match(['panturr', 'calf', 'soleo', 'soleus', 'gastro', 'gastrocnem', 'gemeo', 'gemeos'])
    || (match(['leg press']) && match(['panturr', 'calf', 'soleo', 'soleus']))

  if (isCalves) {
    const contributions: Contribution[] = [{ muscleId: 'calves', weight: 1, role: 'primary' }]
    return {
      exercise_key: key,
      canonical_name: raw,
      mapping: {
        contributions,
        unilateral: false,
        confidence: 0.85,
        notes: 'heuristic: calves',
      },
      confidence: 0.85,
      source: 'heuristic',
    }
  }

  return null
}

