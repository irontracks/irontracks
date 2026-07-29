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

/**
 * Chave por USUÁRIO. As chaves eram constantes globais, então num aparelho
 * compartilhado (mesma família, mesmo navegador) o histórico de deload e a trilha
 * de auditoria de uma conta ficavam visíveis para a próxima que logasse. O cache de
 * histórico de treino ao lado já é escopado exatamente por isso — ver o comentário
 * em utils.ts sobre o vazamento entre contas corrigido em 2026-07-23.
 *
 * Sem `userId` cai na chave legada (não perde o dado de quem já tinha).
 */
const scopedKey = (base: string, userId?: string | null): string => {
    const uid = String(userId ?? '').trim();
    return uid ? `${base}.${uid}` : base;
};

export const loadDeloadHistory = (userId?: string | null): ReportHistory => {
    try {
        if (typeof window === 'undefined') return { version: 1, exercises: {} };
        const raw = window.localStorage.getItem(scopedKey(DELOAD_HISTORY_KEY, userId));
        if (!raw) return { version: 1, exercises: {} };
        const parsed = safeJsonParse(raw);
        return normalizeReportHistory(parsed);
    } catch {
        return { version: 1, exercises: {} };
    }
};

export const saveDeloadHistory = (next: ReportHistory, userId?: string | null) => {
    try {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem(scopedKey(DELOAD_HISTORY_KEY, userId), JSON.stringify(next));
    } catch { }
};

export const appendDeloadAudit = (entry: unknown, userId?: string | null) => {
    try {
        if (typeof window === 'undefined') return;
        const key = scopedKey(DELOAD_AUDIT_KEY, userId);
        const raw = window.localStorage.getItem(key);
        const parsed: unknown = raw ? safeJsonParse(raw) : null;
        const list: unknown[] = Array.isArray(parsed) ? parsed : [];
        const next = [entry, ...list].slice(0, 100);
        window.localStorage.setItem(key, JSON.stringify(next));
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
    // Sem sessões suficientes, os deltas são null e o status cai em 'stable' por
    // FALTA de dado, não por leitura da progressão. Quem afirma algo ao usuário
    // (ou dispara aviso proativo) tem de olhar `hasEnoughHistory`, não só o status.
    const itemsCount = ordered.length;
    const hasEnoughHistory = itemsCount >= DELOAD_HISTORY_MIN && (volumeDelta != null || weightDelta != null);
    return { status, volumeDelta, weightDelta, itemsCount, hasEnoughHistory };
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
    // Sem base suficiente, NÃO afirma cenário. Antes dizia "devido à progressão
    // estável nos últimos histórico curto (1 treinos)" — uma frase com cara de
    // análise, calculada sobre um único ponto de dado.
    const enough = analysis?.hasEnoughHistory !== false && historyCount >= DELOAD_HISTORY_MIN;
    if (!enough) {
        const n = Number(historyCount) || 0;
        return n > 0
            ? `Redução de ${pct}%. Só ${n} ${n === 1 ? 'treino' : 'treinos'} no histórico — ainda não dá pra afirmar estagnação; ajuste no slider se precisar.`
            : `Redução de ${pct}%. Sem histórico deste exercício — valor de partida, ajuste no slider se precisar.`;
    }
    const label =
        analysis?.status === 'overtraining'
            ? 'regressão'
            : analysis?.status === 'stagnation'
                ? 'estagnação'
                : 'progressão estável';
    return `Redução de ${pct}% devido à ${label} nos últimos ${historyCount} treinos.`;
};
