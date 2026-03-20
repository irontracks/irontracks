import type { AdvancedConfig } from '@/types/app'

export type DashboardWorkout = {
  id?: string
  user_id?: string | null
  created_by?: string | null
  name?: string
  title?: string
  notes?: string | null
  exercises?: DashboardExercise[]
  exercises_count?: number | null
  archived_at?: string | null
  sort_order?: number
  created_at?: string | null
}

export type DashboardSetDetail = {
  set_number: number
  reps: string | null
  rpe: number | null
  weight: number | null
  isWarmup: boolean
  advancedConfig: AdvancedConfig | AdvancedConfig[] | null
}

export type DashboardExercise = {
  id: string
  name: string
  notes: string | null
  videoUrl: string | null
  restTime: number | null
  cadence: string | null
  method: string | null
  sets: number
  reps: string
  rpe: number
  setDetails?: DashboardSetDetail[]
}
