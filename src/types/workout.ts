import { z } from 'zod'

// ─── Zod Validation Schemas (API layer) ─────────────────────────────────────

export const SetDetailSchema = z.object({
    set_number: z.number().int().min(1),
    reps: z.union([z.string(), z.number()]).nullable().optional(),
    weight: z.number().nullable().optional(),
    rpe: z.number().min(0).max(10).nullable().optional(),
    is_warmup: z.boolean().optional(),
    completed: z.boolean().optional(),
    advanced_config: z.unknown().nullable().optional(),
})
export type SetDetail = z.infer<typeof SetDetailSchema>

export const ExerciseInputSchema = z.object({
    name: z.string().min(1, 'Nome do exercício obrigatório').max(200),
    sets: z.union([z.number().int().min(0), z.string()]).optional(),
    reps: z.union([z.string(), z.number()]).nullable().optional(),
    rpe: z.union([z.number(), z.string()]).nullable().optional(),
    method: z.string().nullable().optional(),
    rest_time: z.union([z.number(), z.string()]).nullable().optional(),
    video_url: z.string().url().nullable().optional().or(z.literal('')),
    notes: z.string().nullable().optional(),
    cadence: z.string().nullable().optional(),
    order: z.number().int().min(0).optional(),
    set_details: z.array(SetDetailSchema).optional(),
})
export type ExerciseInput = z.infer<typeof ExerciseInputSchema>

export const WorkoutInputSchema = z.object({
    name: z.string().min(1, 'Nome do treino obrigatório').max(200),
    notes: z.string().nullable().optional(),
    date: z.string().optional(),
    is_template: z.boolean().optional(),
    exercises: z.array(ExerciseInputSchema).optional(),
})
export type WorkoutInput = z.infer<typeof WorkoutInputSchema>

export const FinishWorkoutSchema = z.object({
    workout: z.record(z.unknown()),
    elapsedSeconds: z.number().int().min(0),
    logs: z.record(z.unknown()).optional(),
    ui: z.record(z.unknown()).optional(),
    postCheckin: z.record(z.unknown()).nullable().optional(),
})
export type FinishWorkoutInput = z.infer<typeof FinishWorkoutSchema>

// ─── Domain Types (component layer) ─────────────────────────────────────────

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
