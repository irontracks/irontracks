/**
 * assessmentUtils.ts
 *
 * Funções utilitárias puras para o módulo de avaliações físicas.
 * Extraídas do AssessmentHistory.tsx (L52–280) para reutilização.
 * Nenhuma dependência de estado, hooks ou props.
 */

import { parseJsonWithSchema } from '@/utils/zod';
import { z } from 'zod';

// ─── Tipo base ────────────────────────────────────────────────────────────────

export interface AssessmentRow {
    id?: string;
    weight?: number | string | null;
    bf?: number | string | null;
    waist?: number | string | null;
    arm?: number | string | null;
    sum7?: number | string | null;
    date?: string | null;
    notes?: string | null;
    [key: string]: unknown;
}

// ─── Helpers de tipo ──────────────────────────────────────────────────────────

export const isRecord = (v: unknown): v is Record<string, unknown> =>
    v !== null && typeof v === 'object' && !Array.isArray(v);

export const toPositiveNumberOrNull = (value: unknown): number | null => {
    const num = typeof value === 'string' ? Number(value.replace(',', '.')) : Number(value);
    return Number.isFinite(num) && num > 0 ? num : null;
};

// ─── Composição corporal ──────────────────────────────────────────────────────

export const getWeightKg = (assessment: AssessmentRow): number | null =>
    toPositiveNumberOrNull(assessment?.weight);

export const getBodyFatPercent = (assessment: AssessmentRow): number | null =>
    toPositiveNumberOrNull(assessment?.body_fat_percentage ?? assessment?.bf);

export const getFatMassKg = (assessment: AssessmentRow): number | null => {
    const stored = toPositiveNumberOrNull(assessment?.fat_mass);
    if (stored) return stored;
    const weight = getWeightKg(assessment);
    const bf = getBodyFatPercent(assessment);
    if (!weight || !bf) return null;
    const computed = (weight * bf) / 100;
    return Number.isFinite(computed) && computed > 0 ? computed : null;
};

export const getLeanMassKg = (assessment: AssessmentRow): number | null => {
    const weight = getWeightKg(assessment);
    const bf = getBodyFatPercent(assessment);
    const fatMass = getFatMassKg(assessment);
    const stored = toPositiveNumberOrNull(assessment?.lean_mass);

    if (stored) {
        if (!weight) return stored;
        const epsilon = 0.05;
        const isEqualToWeight = Math.abs(stored - weight) <= epsilon;
        const hasCompositionInputs = !!bf || !!fatMass;
        if (!isEqualToWeight || hasCompositionInputs) {
            return stored > 0 && stored < weight ? stored : null;
        }
    }

    if (!weight || !bf) return null;
    const computed = weight * (1 - bf / 100);
    return Number.isFinite(computed) && computed > 0 && computed < weight ? computed : null;
};

export const getBmrKcal = (assessment: AssessmentRow): number | null =>
    toPositiveNumberOrNull(assessment?.bmr);

// ─── Medidas ──────────────────────────────────────────────────────────────────

export const getMeasurementCm = (assessment: AssessmentRow, key: string): number | null => {
    const measurements = isRecord(assessment?.measurements)
        ? (assessment.measurements as Record<string, unknown>)
        : null;
    const nested = toPositiveNumberOrNull(measurements?.[key]);
    if (nested) return nested;

    const keyMap: Record<string, string> = {
        arm: 'arm_circ',
        chest: 'chest_circ',
        waist: 'waist_circ',
        hip: 'hip_circ',
        thigh: 'thigh_circ',
        calf: 'calf_circ',
    };

    const flatKey = keyMap[key];
    if (flatKey) return toPositiveNumberOrNull(assessment?.[flatKey]);
    return null;
};

export const getSkinfoldMm = (assessment: AssessmentRow, key: string): number | null => {
    const skinfolds = isRecord(assessment?.skinfolds)
        ? (assessment.skinfolds as Record<string, unknown>)
        : null;
    const nested = toPositiveNumberOrNull(skinfolds?.[key]);
    if (nested) return nested;

    const keyMap: Record<string, string> = {
        triceps: 'triceps_skinfold',
        biceps: 'biceps_skinfold',
        subscapular: 'subscapular_skinfold',
        suprailiac: 'suprailiac_skinfold',
        abdominal: 'abdominal_skinfold',
        thigh: 'thigh_skinfold',
        calf: 'calf_skinfold',
    };

    const flatKey = keyMap[key];
    if (flatKey) return toPositiveNumberOrNull(assessment?.[flatKey]);
    return null;
};

export const getSum7Mm = (assessment: AssessmentRow): number | null => {
    const measurements = isRecord(assessment?.measurements)
        ? (assessment.measurements as Record<string, unknown>)
        : null;
    const stored = toPositiveNumberOrNull(assessment?.sum7 ?? measurements?.sum7);
    if (stored) return stored;

    const t = Number(assessment?.triceps_skinfold) || 0;
    const b = Number(assessment?.biceps_skinfold) || 0;
    const s = Number(assessment?.subscapular_skinfold) || 0;
    const si = Number(assessment?.suprailiac_skinfold) || 0;
    const a = Number(assessment?.abdominal_skinfold) || 0;
    const th = Number(assessment?.thigh_skinfold) || 0;
    const c = Number(assessment?.calf_skinfold) || 0;

    const sum = t + b + s + si + a + th + c;
    return sum > 0 ? sum : null;
};

// ─── Utilitários de data e JSON ───────────────────────────────────────────────

export const safeJsonParse = (raw: unknown): Record<string, unknown> | null => {
    try {
        if (!raw) return null;
        if (isRecord(raw)) return raw;
        if (typeof raw !== 'string') return null;
        const parsed: unknown = parseJsonWithSchema(raw, z.record(z.unknown()));
        return isRecord(parsed) ? parsed : null;
    } catch {
        return null;
    }
};

export const safeDateMs = (raw: unknown): number | null => {
    if (!raw) return null;
    const obj = isRecord(raw) ? raw : null;
    const toDate = obj && typeof obj.toDate === 'function' ? (obj.toDate as () => unknown) : null;
    const d = toDate
        ? toDate()
        : new Date(
            typeof raw === 'string' || typeof raw === 'number' || raw instanceof Date
                ? raw
                : String(raw),
        );
    if (!(d instanceof Date)) return null;
    const t = d.getTime();
    return Number.isFinite(t) ? t : null;
};

export const safeDateMsStartOfDay = (raw: unknown): number | null => {
    if (!raw) return null;
    if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) {
        const d = new Date(`${raw.trim()}T00:00:00.000`);
        const t = d.getTime();
        return Number.isFinite(t) ? t : null;
    }
    return safeDateMs(raw);
};

export const safeDateMsEndOfDay = (raw: unknown): number | null => {
    if (!raw) return null;
    if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) {
        const d = new Date(`${raw.trim()}T23:59:59.999`);
        const t = d.getTime();
        return Number.isFinite(t) ? t : null;
    }
    return safeDateMs(raw);
};

// ─── Utilitários de treino ────────────────────────────────────────────────────

export const countSessionSets = (session: Record<string, unknown>): number => {
    const logs = session?.logs;
    if (logs && typeof logs === 'object') {
        try {
            const values: unknown[] = Object.values(logs as Record<string, unknown>);
            if (Array.isArray(values)) {
                const doneCount = values.reduce<number>((acc: number, v: unknown) => {
                    if (isRecord(v) && v.done === true) return acc + 1;
                    return acc;
                }, 0);
                if (doneCount > 0) return doneCount;
                return values.length;
            }
        } catch {
            return 0;
        }
    }

    const exercises = Array.isArray(session?.exercises) ? session.exercises : [];
    let total = 0;
    for (const exRaw of exercises) {
        const ex = isRecord(exRaw) ? exRaw : {};
        const setsArr = Array.isArray(ex?.sets) ? (ex.sets as unknown[]) : null;
        if (setsArr) {
            total += setsArr.length;
            continue;
        }
        const count = typeof ex?.sets === 'number' ? ex.sets : Number(ex?.sets);
        if (Number.isFinite(count) && count > 0) total += Math.floor(count);
    }
    return total;
};

export const estimateStrengthTrainingMet = (seconds: number, setsCount: number): number => {
    const minutes = seconds > 0 ? seconds / 60 : 0;
    if (!Number.isFinite(minutes) || minutes <= 0) return 4.8;
    const setsPerMin = setsCount > 0 ? setsCount / minutes : 0;
    if (!Number.isFinite(setsPerMin) || setsPerMin <= 0) return 4.8;

    if (setsPerMin < 0.25) return 3.8;
    if (setsPerMin < 0.35) return 4.6;
    if (setsPerMin < 0.5) return 5.3;
    return 5.9;
};

export const uniqueStrings = (values: unknown[]): string[] => {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const v of values) {
        if (typeof v !== 'string') continue;
        const s = v.trim();
        if (!s || seen.has(s)) continue;
        seen.add(s);
        out.push(s);
    }
    return out;
};
