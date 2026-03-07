export type DropSetStep = {
  weight: number | null
  reps: string | null
}

export type DropSetConfig = DropSetStep[]

export type RestPauseConfig = {
  weight: number | null
  initial_reps: number | null
  rest_time_sec: number | null
  mini_sets: number | null
}

export type ClusterSetConfig = {
  weight: number | null
  total_reps: number | null
  cluster_size: number | null
  intra_rest_sec: number | null
}

export type SetAdvancedConfig = DropSetConfig | RestPauseConfig | ClusterSetConfig | null

export type SetRow = {
  id: string
  exercise_id: string
  weight: number | null
  reps: string | null
  rpe: number | null
  set_number: number | null
  completed: boolean | null
  is_warmup: boolean | null
  advanced_config: SetAdvancedConfig
}

