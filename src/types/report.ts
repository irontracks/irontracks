/**
 * Typed interfaces for the report system.
 * Replaces the `AnyObj = Record<string, any>` pattern.
 */

// ─── Session & Exercise types ────────────────────────────────────────────────

export interface SessionData {
    id?: string
    user_id?: string
    userId?: string
    workoutTitle?: string
    date?: unknown
    totalTime?: number
    realTotalTime?: number
    executionTotalSeconds?: number
    execution_total_seconds?: number
    restTotalSeconds?: number
    rest_total_seconds?: number
    exerciseDurations?: number[]
    exercises?: ExerciseData[]
    logs?: Record<string, LogEntry>
    ai?: AiInsights | null
    reportMeta?: ReportMeta | null
    outdoorBike?: OutdoorBikeData | null
    preCheckin?: CheckinData | null
    postCheckin?: CheckinData | null
    teamMeta?: TeamMeta | null
    student_id?: string
    studentId?: string
    [key: string]: unknown
}

export interface ExerciseData {
    name?: string
    sets?: number | string
    reps?: string | number
    rpe?: string | number
    cadence?: string
    restTime?: string | number
    method?: string
    notes?: string
    [key: string]: unknown
}

export interface LogEntry {
    weight?: string | number
    reps?: string | number
    notes?: string
    note?: string
    observation?: string
    is_warmup?: boolean
    isWarmup?: boolean
    advanced_config?: Record<string, unknown>
    advancedConfig?: Record<string, unknown>
    [key: string]: unknown
}

// ─── Report metrics ──────────────────────────────────────────────────────────

export interface ReportMeta {
    totals?: Record<string, unknown>
    rest?: Record<string, unknown>
    weekly?: Record<string, unknown>
    loadFlags?: Record<string, unknown>
    exercises?: ReportExerciseMeta[]
    [key: string]: unknown
}

export interface ReportExerciseMeta {
    name?: string
    order?: number
    setsDone?: number
    repsDone?: number
    executionMinutes?: number
    restMinutes?: number
    restTimePlannedSec?: number
    avgWeightKg?: number
    volumeKg?: number
    delta?: {
        volumeKg?: number
        reps?: number
        avgWeightKg?: number
    }
    [key: string]: unknown
}

// ─── AI insights ─────────────────────────────────────────────────────────────

export interface AiInsights {
    rating?: number
    stars?: number
    score?: number
    rating_reason?: string
    ratingReason?: string
    reason?: string
    summary?: string | string[]
    motivation?: string
    highlights?: string[]
    warnings?: string[]
    prs?: AiPr[]
    progression?: AiProgression[]
    [key: string]: unknown
}

export interface AiPr {
    exercise?: string
    name?: string
    value?: string
    text?: string
    [key: string]: unknown
}

export interface AiProgression {
    exercise?: string
    name?: string
    recommendation?: string
    action?: string
    text?: string
    [key: string]: unknown
}

// ─── Outdoor bike ────────────────────────────────────────────────────────────

export interface OutdoorBikeData {
    distanceMeters?: number
    durationSeconds?: number
    avgSpeedKmh?: number
    maxSpeedKmh?: number
    caloriesKcal?: number
    [key: string]: unknown
}

// ─── Check-in ────────────────────────────────────────────────────────────────

export interface CheckinData {
    energy?: number
    soreness?: number
    timeMinutes?: number
    rpe?: number
    satisfaction?: number
    mood?: number
    notes?: string
    answers?: Record<string, unknown>
    [key: string]: unknown
}

// ─── Team ────────────────────────────────────────────────────────────────────

export interface TeamMeta {
    participants?: TeamParticipant[]
    [key: string]: unknown
}

export interface TeamParticipant {
    uid?: string
    id?: string
    name?: string
    email?: string
    [key: string]: unknown
}

// ─── Report build output ─────────────────────────────────────────────────────

export interface SetProgression {
    type: 'weight' | 'reps' | 'volume'
    deltaText: string
    direction: 'up' | 'down' | 'flat'
}

export interface SetRow {
    index: number
    weight: unknown
    reps: unknown
    cadence: unknown
    tag: string | null
    note: string | null
    progression: SetProgression | null
}

export interface ExerciseReport {
    name: string
    method: string | null
    rpe: unknown
    cadence: unknown
    baseLabel: string | null
    showProgression: boolean
    sets: SetRow[]
}
