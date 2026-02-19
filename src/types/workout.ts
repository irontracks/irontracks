export interface PeriodStats {
    count: number;
    totalMinutes: number;
    avgMinutes: number;
    totalVolumeKg: number;
    avgVolumeKg: number;
    totalSets?: number;
    totalReps?: number;
    uniqueDaysCount?: number;
    topExercisesByVolume?: Array<{ name: string; sets: number; reps: number; volumeKg: number; sessionsCount: number }>;
    topExercisesByFrequency?: Array<{ name: string; sets: number; reps: number; volumeKg: number; sessionsCount: number }>;
    sessionSummaries?: Array<{ date: unknown; minutes: number; volumeKg: number }>;
    [key: string]: unknown;
}

export interface DashboardWorkout {
    id?: string
    userId?: string | null
    createdBy?: string | null
    title?: string
    notes?: string | null
    exercises?: WorkoutExercise[]
    exercisesCount?: number | null
    archivedAt?: string | null
    sortOrder?: number
    createdAt?: string | null
}

export interface WorkoutExercise {
    id: string
    name: string
    notes?: string
    videoUrl?: string
    restTime?: number
    cadence?: string
    method?: string
    sets?: number
    reps?: string
    rpe?: number
    setDetails?: WorkoutSet[]
    order?: number
    [key: string]: unknown
}

export interface WorkoutSet {
    setNumber: number
    reps?: string | null
    rpe?: number | null
    weight?: number | null
    isWarmup: boolean
    advancedConfig?: unknown
    completed?: boolean
}

export interface CheckinRow {
    id: string
    kind: string
    created_at: string
    energy?: number | null
    mood?: number | null
    soreness?: number | null
    notes?: string | null
    answers?: Record<string, unknown>
    workout_id?: string | null
    planned_workout_id?: string | null
}
