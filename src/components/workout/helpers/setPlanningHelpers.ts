/**
 * setPlanningHelpers.ts
 *
 * Pure/near-pure helper functions for workout set planning,
 * extracted from useActiveWorkoutController.ts.
 */

import {
    UnknownRecord,
    WorkoutExercise,
} from '../types';
import {
    isObject,
    toNumber,
    extractLogWeight,
} from '../utils';

// ─── Helpers ──────────────────────────────────────────────────────────────────

export const getPlanConfig = (ex: WorkoutExercise, setIdx: number): UnknownRecord | null => {
    const sdArr: unknown[] = Array.isArray(ex.setDetails) ? (ex.setDetails as unknown[]) : Array.isArray(ex.set_details) ? (ex.set_details as unknown[]) : [];
    const sd = isObject(sdArr?.[setIdx]) ? (sdArr[setIdx] as UnknownRecord) : null;
    const cfg = sd ? (sd.advanced_config ?? sd.advancedConfig ?? null) : null;
    return isObject(cfg) ? cfg : null;
};

export const normalizeNaturalNote = (v: unknown) => {
    try {
        return String(v ?? '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim();
    } catch {
        return String(v ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
    }
};

export const inferDropSetStagesFromNote = (notes: unknown): number => {
    const s = normalizeNaturalNote(notes);
    if (!s) return 0;
    if (!s.includes('drop')) return 0;
    const isDouble = s.includes('duplo') || s.includes('dupla') || s.includes('2 drops') || s.includes('2drop');
    const isTriple = s.includes('triplo') || s.includes('tripla') || s.includes('3 drops') || s.includes('3drop');
    if (isTriple) return 4;
    if (isDouble) return 3;
    return 2;
};

export const shouldInjectDropSetForSet = (ex: WorkoutExercise, setIdx: number, setsCount: number): number => {
    const notes = String(ex?.notes ?? '').trim();
    if (!notes) return 0;
    const normalized = normalizeNaturalNote(notes);
    if (!normalized.includes('drop')) return 0;
    if (normalized.includes('em todas') || normalized.includes('todas as series') || normalized.includes('todas series')) {
        return inferDropSetStagesFromNote(notes);
    }
    const wantsLast = normalized.includes('ultima') || normalized.includes('ultim');
    if (!wantsLast) return 0;
    if (setIdx !== Math.max(0, setsCount - 1)) return 0;
    return inferDropSetStagesFromNote(notes);
};

export const getPlannedSet = (ex: WorkoutExercise, setIdx: number): UnknownRecord | null => {
    const sdArr: unknown[] = Array.isArray(ex.setDetails) ? (ex.setDetails as unknown[]) : Array.isArray(ex.set_details) ? (ex.set_details as unknown[]) : [];
    const sd = isObject(sdArr?.[setIdx]) ? (sdArr[setIdx] as UnknownRecord) : null;
    const rawCfg = sd ? (sd.advanced_config ?? sd.advancedConfig ?? null) : null;
    if (Array.isArray(rawCfg) && rawCfg.length > 0) return sd;

    const setsHeader = Math.max(0, Number.parseInt(String(ex?.sets ?? '0'), 10) || 0);
    const setsCount = Math.max(setsHeader, Array.isArray(sdArr) ? sdArr.length : 0) || 0;
    const inferredStages = shouldInjectDropSetForSet(ex, setIdx, setsCount);
    if (inferredStages > 0) {
        const stages = Array.from({ length: inferredStages }).map(() => ({ weight: null as number | null, reps: null as number | null }));
        return {
            ...(sd || {}),
            it_auto: { ...(isObject(sd?.it_auto) ? (sd?.it_auto as UnknownRecord) : {}), label: 'Drop' },
            advanced_config: stages,
        };
    }

    return sd;
};

// ─── Collectors ───────────────────────────────────────────────────────────────

type GetLogFn = (key: string) => UnknownRecord;

export const collectExerciseSetInputs = (ex: WorkoutExercise, exIdx: number, getLog: GetLogFn) => {
    const setsHeader = Math.max(0, Number.parseInt(String(ex?.sets ?? '0'), 10) || 0);
    const sdArr: unknown[] = Array.isArray(ex.setDetails) ? (ex.setDetails as unknown[]) : Array.isArray(ex.set_details) ? (ex.set_details as unknown[]) : [];
    const setsCount = Math.max(setsHeader, Array.isArray(sdArr) ? sdArr.length : 0);
    const sets: Array<{ weight: number | null; reps: number | null }> = [];
    for (let setIdx = 0; setIdx < setsCount; setIdx += 1) {
        const key = `${exIdx}-${setIdx}`;
        const log = getLog(key);
        const cfg = getPlanConfig(ex, setIdx);
        const planned = getPlannedSet(ex, setIdx);
        const logWeight = extractLogWeight(log);
        const fallbackWeight = toNumber(cfg?.weight ?? planned?.weight ?? null);
        const weight = logWeight != null ? logWeight : fallbackWeight;
        const reps = toNumber(log.reps ?? planned?.reps ?? ex?.reps ?? null);
        if (weight != null || reps != null) {
            sets.push({ weight, reps });
        }
    }
    return { setsCount, sets };
};

export const collectExercisePlannedInputs = (ex: WorkoutExercise, exIdx: number) => {
    const setsHeader = Math.max(0, Number.parseInt(String(ex?.sets ?? '0'), 10) || 0);
    const sdArr: unknown[] = Array.isArray(ex.setDetails) ? (ex.setDetails as unknown[]) : Array.isArray(ex.set_details) ? (ex.set_details as unknown[]) : [];
    const setsCount = Math.max(setsHeader, Array.isArray(sdArr) ? sdArr.length : 0);
    const sets: Array<{ weight: number | null; reps: number | null }> = [];
    for (let setIdx = 0; setIdx < setsCount; setIdx += 1) {
        const cfg = getPlanConfig(ex, setIdx);
        const planned = getPlannedSet(ex, setIdx);
        const weight = toNumber(cfg?.weight ?? planned?.weight ?? ex?.weight ?? null);
        const reps = toNumber(planned?.reps ?? ex?.reps ?? null);
        if (weight != null || reps != null) {
            sets.push({ weight, reps });
        }
    }
    return { setsCount, sets };
};
