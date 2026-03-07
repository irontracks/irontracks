
import type { Exercise, Workout, UserRecord, ActiveWorkoutSession } from '@/types/app';

export type UnknownRecord = Record<string, unknown>;

export type UserProfile = Partial<UserRecord> & { id?: string };

export type WorkoutExercise = Omit<Partial<Exercise>, 'setDetails'> & {
  name?: string;
  weight?: number | string | null;
  rest?: number | string | null;
  setDetails?: WorkoutSetDetail[] | null;
  set_details?: WorkoutSetDetail[] | null;
  rest_time?: Exercise['restTime'] | null;
  video_url?: string | null;
  exercise_id?: string;
  exercise_library_id?: string;
};

export type WorkoutSetDetail = {
  set_number?: number | null;
  setNumber?: number | null;
  reps?: string | number | null;
  rpe?: number | string | null;
  weight?: number | null;
  is_warmup?: boolean | null;
  isWarmup?: boolean | null;
  advanced_config?: unknown;
  advancedConfig?: unknown;
  notes?: string | null;
  completed?: boolean | null;
  [k: string]: unknown;
};

export type WorkoutDraft = Omit<Partial<Workout>, 'exercises'> & {
  exercises?: WorkoutExercise[];
  workout_id?: string | null;
};

export type WorkoutSession = Omit<Partial<ActiveWorkoutSession>, 'workout'> & {
  workout?: WorkoutDraft | null;
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
