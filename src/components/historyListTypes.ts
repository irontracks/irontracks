/**
 * historyListTypes.ts
 *
 * Tipos, interfaces e schemas Zod extraídos de HistoryList.tsx.
 */

import { z } from 'zod';
import { ExerciseRowSchema, SetRowSchema, WorkoutRowSchema } from '@/schemas/database';
import { PeriodStats } from '@/types/workout';

// ─── Types ────────────────────────────────────────────────────────────────────

export type UnknownRecord = Record<string, unknown>;

export interface WorkoutLog {
    weight?: string | number | null;
    reps?: string | number | null;
    done?: boolean;
    [key: string]: unknown;
}

export interface RawSession {
    id?: string;
    user_id?: string;
    student_id?: string;
    workoutTitle?: string;
    date?: string;
    totalTime?: number;
    logs?: Record<string, WorkoutLog>;
    exercises?: unknown[];
    notes?: string;
    [key: string]: unknown;
}

export interface WorkoutSummary {
    id: string;
    workoutTitle?: string | null;
    date?: string | null;
    dateMs?: number | null;
    totalTime?: number;
    rawSession?: RawSession | null;
    raw?: Record<string, unknown> | null;
    isTemplate?: boolean;
    exercises?: Array<Record<string, unknown>>;
    name?: string | null;
    created_at?: string;
    notes?: string | Record<string, unknown>;
    is_template?: boolean;
    completed_at?: string;
    [key: string]: unknown;
}

export interface WorkoutTemplate {
    id: string;
    name?: string | null;
    exercises?: Array<Record<string, unknown>>;
    [key: string]: unknown;
}

export interface ManualExercise {
    name: string;
    sets: number | string;
    reps: string;
    restTime: number;
    cadence: string;
    notes: string;
    weights?: string[];
    repsPerSet?: string[];
    rest_time?: number;
    [key: string]: unknown;
}

export type NewWorkoutState = {
    title: string;
    exercises: ManualExercise[];
};

export type PeriodReport = { type: 'week' | 'month'; stats: PeriodStats };
export type PeriodAiState = { status: 'idle' | 'loading' | 'ready' | 'error'; ai: Record<string, unknown> | null; error: string };
export type PeriodPdfState = { status: 'idle' | 'loading' | 'ready' | 'error'; url: string | null; blob: Blob | null; error: string };

export interface HistoryListProps {
    user: { id: string; email?: string; displayName?: string; name?: string; role?: string } | null;
    settings?: Record<string, unknown>;
    onViewReport?: (session: unknown) => void;
    onBack?: () => void;
    targetId?: string;
    targetEmail?: string;
    readOnly?: boolean;
    title?: string;
    embedded?: boolean;
    vipLimits?: { history_days?: number };
    onUpgrade?: () => void;
}

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

export const WorkoutLogSchema = z
    .object({
        weight: z.union([z.string(), z.number()]).nullable().optional(),
        reps: z.union([z.string(), z.number()]).nullable().optional(),
        done: z.boolean().optional(),
    })
    .passthrough();

export const RawSessionObjectSchema = z
    .object({
        id: z.string().optional(),
        user_id: z.string().optional(),
        student_id: z.string().optional(),
        workoutTitle: z.string().optional(),
        date: z.string().optional(),
        totalTime: z.number().optional(),
        logs: z.record(WorkoutLogSchema).optional(),
        exercises: z.array(z.unknown()).optional(),
        notes: z.string().optional(),
    })
    .passthrough();

export const RawSessionJsonSchema = z
    .string()
    .transform((raw, ctx) => {
        try {
            const parse = JSON['parse'] as unknown as (s: string) => unknown;
            return parse(raw);
        } catch {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'invalid_json' });
            return z.NEVER;
        }
    })
    .pipe(RawSessionObjectSchema);

export const WorkoutIdNameSchema = z
    .object({
        id: WorkoutRowSchema.shape.id,
        name: WorkoutRowSchema.shape.name,
    })
    .passthrough();

export const ExerciseIdSchema = z
    .object({
        id: ExerciseRowSchema.shape.id,
    })
    .passthrough();

export const SetLiteSchema = z
    .object({
        exercise_id: SetRowSchema.shape.exercise_id,
        set_number: SetRowSchema.shape.set_number,
        reps: SetRowSchema.shape.reps,
        rpe: SetRowSchema.shape.rpe,
        weight: SetRowSchema.shape.weight,
    })
    .passthrough();

// ─── Utilities ─────────────────────────────────────────────────────────────────

export const isRecord = (v: unknown): v is Record<string, unknown> =>
    v !== null && typeof v === 'object' && !Array.isArray(v);

export const parseRawSession = (value: unknown): z.infer<typeof RawSessionObjectSchema> | null => {
    if (typeof value === 'string') {
        const s = String(value || '').trim();
        if (!s.startsWith('{') && !s.startsWith('[')) return null;
        const parsed = RawSessionJsonSchema.safeParse(s);
        return parsed.success ? parsed.data : null;
    }
    const parsed = RawSessionObjectSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
};
