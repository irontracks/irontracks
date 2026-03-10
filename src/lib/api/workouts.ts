/**
 * src/lib/api/workouts.ts
 * Typed API client for workout-related endpoints.
 */
import { apiGet, apiPost } from './_fetch'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WorkoutSummary {
  id: string
  name: string
  started_at: string
  finished_at?: string | null
  exercises_count?: number
}

export interface WorkoutsListResult {
  ok: boolean
  workouts: WorkoutSummary[]
}

export interface WorkoutsHistoryResult {
  ok: boolean
  sessions: WorkoutSummary[]
}

export interface WorkoutUpdatePayload {
  session_id: string
  [key: string]: unknown
}

export interface WorkoutFinishPayload {
  session_id: string
  logs: Record<string, unknown>
  [key: string]: unknown
}

// ─── Client ───────────────────────────────────────────────────────────────────

export const apiWorkouts = {
  /** GET list of workout templates */
  list: (limit = 50) =>
    apiGet<WorkoutsListResult>(`/api/workouts/list?limit=${limit}`),

  /** GET workout session history */
  getHistory: (limit = 50) =>
    apiGet<WorkoutsHistoryResult>(`/api/workouts/history?limit=${limit}`),

  /** POST update an active workout session */
  update: (payload: WorkoutUpdatePayload) =>
    apiPost<{ ok: boolean }>('/api/workouts/update', payload),

  /** POST finish and save a workout session */
  finish: (payload: WorkoutFinishPayload) =>
    apiPost<{ ok: boolean; report?: unknown }>('/api/workouts/finish', payload),
}
