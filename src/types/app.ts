
export interface AdvancedConfig {
  initial_reps?: number | null;
  mini_sets?: number | null;
  rest_time_sec?: number | null;
  weight?: number | null;
  reps?: string | number | null;
  type?: string;
  workSec?: number;
  restSec?: number;
  rounds?: number;
  hitIntensity?: string;
  incline?: string | number;
  speed?: string | number;
  resistance?: string | number;
  heart_rate?: string | number;
  cluster_size?: number | null;
  intra_rest_sec?: number | null;
  total_reps?: number | null;
  isHIT?: boolean;
  [key: string]: unknown;
}

export interface SetDetail {
  set_number: number;
  reps: string | number | null;
  rpe: number | null;
  weight: number | null;
  is_warmup: boolean;
  /** @deprecated Use is_warmup */
  isWarmup?: boolean;
  advanced_config: AdvancedConfig | AdvancedConfig[] | null;
  /** @deprecated Use advanced_config */
  advancedConfig?: AdvancedConfig | AdvancedConfig[] | null;
  completed?: boolean;
  it_auto?: {
    source: string;
    kind: string;
    label: string;
    hash: string;
  } | null;
}

export interface Exercise {
  id?: string;
  name: string;
  sets: number | string;
  reps: string | number | null;
  rpe: number | string | null;
  method?: string | null;
  /** @deprecated Use rest_time (DB column name) */
  restTime?: number | string | null;
  /** DB column: rest_time */
  rest_time?: number | string | null;
  /** @deprecated Use video_url (DB column name) */
  videoUrl?: string | null;
  /** DB column: video_url */
  video_url?: string | null;
  notes?: string | null;
  cadence?: string | null;
  type?: string;
  setDetails?: SetDetail[];
  /** DB column: set_details */
  set_details?: SetDetail[];
  order?: number;
  workout_id?: string;
  _itx_exKey?: string; // Internal key for active session
}

export interface Workout {
  id?: string;
  title?: string;
  name?: string; // Alias for title in some contexts
  notes?: string;
  exercises?: Exercise[];
  created_by?: string;
  user_id?: string;
  is_template?: boolean;
  archived_at?: string | null;
  sort_order?: number;
  created_at?: string | null;
  student_id?: string;
  date?: string | null;
  completed_at?: string | null;
}

export interface UserRecord {
  id: string;
  email?: string;
  displayName?: string;
  photoURL?: string | null;
  role?: string;
  [key: string]: unknown;
}

export interface Profile {
  id: string;
  display_name?: string;
  photo_url?: string;
  role?: string;
  last_seen?: string;
  [key: string]: unknown;
}

export interface DirectChatState {
  channelId: string;
  userId: string;
  displayName?: string;
  photoUrl?: string | null;
  other_user_id?: string;
  other_user_name?: string;
  other_user_photo?: string | null;
  [key: string]: unknown;
}

export interface WorkoutStreak {
  currentStreak: number;
  totalWorkouts: number;
  bestStreak: number;
  totalVolumeKg: number;
  badges: Array<{ id: string; label: string; kind: string }>;
  longestStreak?: number;
  lastWorkoutDate?: string | null;
}

export interface ActiveSession {
  id?: string;
  exercises?: Exercise[];
  name?: string;
  title?: string;
  date?: string;
  workout?: Workout; // Sometimes nested
  [key: string]: unknown;
}

export interface ActiveWorkoutSession {
  startedAt: number;
  workout: ActiveSession; // Using ActiveSession structure for the workout inside session
  logs?: Record<string, unknown>;
  timerTargetTime?: number | null;
  timerContext?: unknown | null;
  _savedAt?: number;
  ui?: {
    baseExerciseCount?: number;
    pendingTemplateUpdate?: boolean;
    preCheckin?: Record<string, unknown> | null;
  };
  [key: string]: unknown;
}

export interface PendingUpdate {
  version: string;
  notes?: string;
  mandatory?: boolean;
  id?: string;
  title?: string;
  description?: string;
  release_date?: string | null;
  releaseDate?: string | null;
  [key: string]: unknown;
}

export interface VipStatus {
  isVip: boolean;
  plan?: string;
  expiresAt?: string | null;
  limits?: unknown;
  [key: string]: unknown;
}

export interface TourState {
  loaded: boolean;
  completed: boolean;
  skipped: boolean;
}

export interface SyncState {
  online: boolean;
  syncing: boolean;
  pending: number;
  failed?: number;
  due?: number;
}

export interface DuplicateGroup {
  items: Array<Record<string, unknown>>;
  score: number;
}
