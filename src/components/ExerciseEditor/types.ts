// Shared types for ExerciseEditor and its sub-components

export interface AdvancedConfig {
    initial_reps?: number | null
    mini_sets?: number | null
    rest_time_sec?: number | null
    weight?: number | null
    reps?: string | number | null
    type?: string
    workSec?: number
    restSec?: number
    rounds?: number
    hitIntensity?: string
    incline?: string | number
    speed?: string | number
    resistance?: string | number
    heart_rate?: string | number
    cluster_size?: number | null
    intra_rest_sec?: number | null
    total_reps?: number | null
    isHIT?: boolean
    [key: string]: unknown
}

export interface SetDetail {
    set_number: number
    reps: string | number | null
    rpe: number | null
    weight: number | null
    is_warmup?: boolean
    isWarmup?: boolean
    advanced_config?: AdvancedConfig | AdvancedConfig[] | null
    advancedConfig?: AdvancedConfig | AdvancedConfig[] | null
    it_auto?: {
        source: string
        kind: string
        label: string
        hash: string
    } | null
}

export interface Exercise {
    name: string
    sets: number | string
    reps: string | number | null
    rpe: number | string | null
    method?: string | null
    restTime?: number | string | null
    rest_time?: number | string | null
    videoUrl?: string | null
    video_url?: string | null
    notes?: string | null
    cadence?: string | null
    type?: string
    setDetails?: SetDetail[]
    set_details?: SetDetail[]
    order?: number
}

export interface Workout {
    id?: string
    title?: string
    notes?: string
    exercises?: Exercise[]
    created_by?: string
    user_id?: string
}
