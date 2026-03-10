/**
 * src/lib/api/ai.ts
 * Typed API client for AI/insights endpoints.
 */
import { apiPost } from './_fetch'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AiInsightResult {
  ok: boolean
  insight?: string
  insights?: unknown
  [key: string]: unknown
}

export interface MuscleMapResult {
  ok: boolean
  muscles?: unknown[]
  map?: unknown
  [key: string]: unknown
}

export interface ProgressionResult {
  ok: boolean
  suggestions?: unknown[]
  [key: string]: unknown
}

export interface PeriodInsightsResult {
  ok: boolean
  insights?: unknown
  [key: string]: unknown
}

// ─── Client ───────────────────────────────────────────────────────────────────

export const apiAi = {
  /** POST generate post-workout insights */
  postWorkoutInsights: (payload: Record<string, unknown>) =>
    apiPost<AiInsightResult>('/api/ai/post-workout-insights', payload),

  /** POST generate exercise muscle map */
  exerciseMuscleMap: (payload: Record<string, unknown>) =>
    apiPost<MuscleMapResult>('/api/ai/exercise-muscle-map', payload),

  /** POST generate weekly muscle map */
  muscleMapWeek: (payload: Record<string, unknown>) =>
    apiPost<MuscleMapResult>('/api/ai/muscle-map-week', payload),

  /** POST generate daily muscle map */
  muscleMapDay: (payload: Record<string, unknown>) =>
    apiPost<MuscleMapResult>('/api/ai/muscle-map-day', payload),

  /** POST backfill exercise muscle maps */
  exerciseMuscleMapBackfill: (payload: Record<string, unknown>) =>
    apiPost<MuscleMapResult>('/api/ai/exercise-muscle-map-backfill', payload),

  /** POST apply progression suggestions to next workout */
  applyProgressionNext: (payload: Record<string, unknown>) =>
    apiPost<ProgressionResult>('/api/ai/apply-progression-next', payload),

  /** POST generate period insights (history analysis) */
  periodInsights: (payload: Record<string, unknown>) =>
    apiPost<PeriodInsightsResult>('/api/ai/period-insights', payload),
}
