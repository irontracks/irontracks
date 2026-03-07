/**
 * deloadHelpers.ts
 *
 * Pure helper functions for the deload/periodization engine,
 * extracted from useActiveWorkoutController.ts.
 */

import {
    ReportHistory,
    ReportHistoryItem,
    AiRecommendation,
    DeloadAnalysis,
} from '../types';
import {
    safeJsonParse,
    normalizeReportHistory,
    averageNumbers,
    toNumber,
    estimate1Rm,
    DELOAD_HISTORY_KEY,
    DELOAD_AUDIT_KEY,
    DELOAD_HISTORY_SIZE,
    DELOAD_HISTORY_MIN,
    DELOAD_RECENT_WINDOW,
    DELOAD_STAGNATION_PCT,
    DELOAD_REGRESSION_PCT,
} from '../utils';

// ─── LocalStorage ─────────────────────────────────────────────────────────────

export const loadDeloadHistory = (): ReportHistory => {
    try {
        if (typeof window === 'undefined') return { version: 1, exercises: {} };
        const raw = window.localStorage.getItem(DELOAD_HISTORY_KEY);
        if (!raw) return { version: 1, exercises: {} };
        const parsed = safeJsonParse(raw);
        return normalizeReportHistory(parsed);
    } catch {
        return { version: 1, exercises: {} };
    }
};

export const saveDeloadHistory = (next: ReportHistory) => {
    try {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem(DELOAD_HISTORY_KEY, JSON.stringify(next));
    } catch { }
};

export const appendDeloadAudit = (entry: unknown) => {
    try {
        if (typeof window === 'undefined') return;
        const raw = window.localStorage.getItem(DELOAD_AUDIT_KEY);
        const parsed: unknown = raw ? safeJsonParse(raw) : null;
        const list: unknown[] = Array.isArray(parsed) ? parsed : [];
        const next = [entry, ...list].slice(0, 100);
        window.localStorage.setItem(DELOAD_AUDIT_KEY, JSON.stringify(next));
    } catch { }
};

// ─── Pure Analysis Functions ──────────────────────────────────────────────────

export const analyzeDeloadHistory = (items: ReportHistoryItem[]): DeloadAnalysis => {
    const ordered = Array.isArray(items) ? items.slice(-DELOAD_HISTORY_SIZE) : [];
    const recent = ordered.slice(-DELOAD_RECENT_WINDOW);
    const older = ordered.slice(0, Math.max(0, ordered.length - recent.length));
    const avgRecentVolume = averageNumbers(recent.map((i) => i.totalVolume).filter((v) => typeof v === 'number' && Number.isFinite(v) && v > 0));
    const avgOlderVolume = averageNumbers(older.map((i) => i.totalVolume).filter((v) => typeof v === 'number' && Number.isFinite(v) && v > 0));
    const avgRecentWeight = averageNumbers(recent.map((i) => i.avgWeight).filter((v) => typeof v === 'number' && Number.isFinite(v) && v > 0));
    const avgOlderWeight = averageNumbers(older.map((i) => i.avgWeight).filter((v) => typeof v === 'number' && Number.isFinite(v) && v > 0));

    const volumeDelta = avgOlderVolume && avgRecentVolume ? (avgRecentVolume - avgOlderVolume) / avgOlderVolume : null;
    const weightDelta = avgOlderWeight && avgRecentWeight ? (avgRecentWeight - avgOlderWeight) / avgOlderWeight : null;

    const hasRegression =
        (volumeDelta != null && volumeDelta <= -DELOAD_REGRESSION_PCT) ||
        (weightDelta != null && weightDelta <= -DELOAD_REGRESSION_PCT);
    const hasStagnation =
        (!hasRegression && volumeDelta != null && Math.abs(volumeDelta) <= DELOAD_STAGNATION_PCT) ||
        (!hasRegression && weightDelta != null && Math.abs(weightDelta) <= DELOAD_STAGNATION_PCT);

    const status: DeloadAnalysis['status'] = hasRegression ? 'overtraining' : hasStagnation ? 'stagnation' : 'stable';
    return { status, volumeDelta, weightDelta };
};

export const parseAiRecommendation = (text: unknown): AiRecommendation => {
    try {
        const raw = String(text || '').trim();
        if (!raw) return { weight: null, reps: null, rpe: null };
        const weightMatch = raw.match(/(\d+(?:[.,]\d+)?)\s*kg/i);
        const repsMatch = raw.match(/(\d+(?:[.,]\d+)?)\s*reps?/i);
        const rpeMatch = raw.match(/rpe\s*([0-9]+(?:[.,]\d+)?)/i);
        const weight = toNumber(weightMatch ? weightMatch[1] : null);
        const reps = toNumber(repsMatch ? repsMatch[1] : null);
        const rpe = toNumber(rpeMatch ? rpeMatch[1] : null);
        return { weight: weight && weight > 0 ? weight : null, reps: reps && reps > 0 ? reps : null, rpe: rpe && rpe > 0 ? rpe : null };
    } catch {
        return { weight: null, reps: null, rpe: null };
    }
};

export const estimate1RmFromSets = (
    sets: Array<{ weight: number | null; reps: number | null }>,
    historyItems: ReportHistoryItem[],
): number | null => {
    const candidates: number[] = [];
    const list = Array.isArray(sets) ? sets : [];
    list.forEach((s) => {
        const w = Number(s.weight ?? 0);
        const r = Number(s.reps ?? 0);
        const est = estimate1Rm(w, r);
        if (est) candidates.push(est);
    });
    const hist = Array.isArray(historyItems) ? historyItems : [];
    hist.forEach((h) => {
        const est = estimate1Rm(h.topWeight ?? null, h.avgReps ?? null);
        if (est) candidates.push(est);
    });
    if (!candidates.length) return null;
    return Math.max(...candidates);
};

export const getDeloadReason = (analysis: DeloadAnalysis, reductionPct: number, historyCount: number) => {
    const pct = Math.round((Number(reductionPct) || 0) * 1000) / 10;
    const label =
        analysis?.status === 'overtraining'
            ? 'regressão'
            : analysis?.status === 'stagnation'
                ? 'estagnação'
                : 'progressão estável';
    const historyLabel = historyCount >= DELOAD_HISTORY_MIN ? `${historyCount} treinos` : `histórico curto (${historyCount || 0} treinos)`;
    return `Redução de ${pct}% devido à ${label} nos últimos ${historyLabel}.`;
};
