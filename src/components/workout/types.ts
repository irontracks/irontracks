
export type UnknownRecord = Record<string, unknown>;

export type UserProfile = {
  id?: string;
  role?: string;
  [k: string]: unknown;
};

export type WorkoutExercise = {
  id?: string;
  name?: string;
  sets?: unknown;
  reps?: unknown;
  restTime?: unknown;
  rest_time?: unknown;
  setDetails?: unknown;
  set_details?: unknown;
  videoUrl?: string;
  video_url?: string;
  notes?: string;
  method?: string;
  exercise_id?: string;
  exercise_library_id?: string;
  [k: string]: unknown;
};

export type WorkoutDraft = {
  id?: string;
  title?: string;
  exercises?: WorkoutExercise[];
  workout_id?: string;
  [k: string]: unknown;
};

export type WorkoutSession = {
  id?: string;
  workout?: WorkoutDraft | null;
  logs?: Record<string, unknown>;
  ui?: UnknownRecord;
  startedAt?: string | number | Date;
  completed_at?: string | number | Date;
  completedAt?: string | number | Date;
  date?: string | number | Date;
  [k: string]: unknown;
};

export type ActiveWorkoutProps = {
  session: WorkoutSession | null;
  user: UserProfile | null;
  settings?: UnknownRecord | null;
  onUpdateLog?: (key: string, updates: UnknownRecord) => void;
  onFinish?: (session: WorkoutSession | null, showReport: boolean) => void;
  onPersistWorkoutTemplate?: (workout: WorkoutDraft) => void;
  onBack?: () => void;
  onStartTimer?: (seconds: number, context: unknown) => void;
  isCoach?: boolean;
  onUpdateSession?: (updates: UnknownRecord) => void;
  nextWorkout?: UnknownRecord | null;
  onEditWorkout?: () => void;
  onAddExercise?: () => void;
};

export type ReportHistoryItem = {
  ts: number;
  avgWeight: number | null;
  avgReps: number | null;
  totalVolume: number;
  topWeight: number | null;
  setsCount: number;
  name?: string;
};

export type ReportHistory = {
  version: number;
  exercises: Record<string, { name: string; items: ReportHistoryItem[] }>;
};

export type AiRecommendation = { weight: number | null; reps: number | null; rpe: number | null };
export type DeloadSetEntries = Record<string, { weight: number | null; reps: number | null; rpe: number | null }>;
export type DeloadAnalysis = { status: 'overtraining' | 'stagnation' | 'stable'; volumeDelta: number | null; weightDelta: number | null };

export type DeloadSuggestion =
  | {
      ok: true;
      name: string;
      exIdx: number;
      baseWeight: number;
      suggestedWeight: number;
      appliedReduction: number;
      targetReduction: number;
      historyCount: number;
      minWeight: number;
      analysis: DeloadAnalysis;
    }
  | { ok: false; error: string };

export type DeloadSetSuggestion =
  | { ok: true; name: string; key: string; entries: DeloadSetEntries; itemsCount: number; baseSuggestion: DeloadSuggestion | null }
  | { ok: false; error: string };
