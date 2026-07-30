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
    UnknownRecord,
} from '../types';
import {
    isObject,
    safeJsonParse,
    normalizeReportHistory,
    averageNumbers,
    toNumber,
    estimate1Rm,
    clampNumber,
    roundToStep,
    extractLogWeight,
    WEIGHT_ROUND_STEP,
    DELOAD_HISTORY_KEY,
    DELOAD_AUDIT_KEY,
    DELOAD_HISTORY_SIZE,
    DELOAD_HISTORY_MIN,
    DELOAD_RECENT_WINDOW,
    DELOAD_STAGNATION_PCT,
    DELOAD_REGRESSION_PCT,
    DELOAD_REDUCTION_MIN,
    DELOAD_REDUCTION_MAX,
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

// ─── Aplicação do deload (núcleo puro) ────────────────────────────────────────

export type DeloadSetInput = {
    /** "exIdx-setIdx" */
    key: string;
    /** log atual da série (peso/reps/rpe/done/weightSource/advanced_config). */
    log: UnknownRecord;
    /** Peso planejado desta série (do plano ou do template), quando houver. */
    plannedWeight: number | null;
    /** Sugestão de reps/RPE já calculada para esta série, quando houver. */
    suggestion: UnknownRecord | null;
    /** advanced_config resolvido para esta série. */
    cfg: unknown;
};

export type DeloadPatch = { key: string; patch: UnknownRecord };

export type DeloadPlan = {
    patches: DeloadPatch[];
    /** Séries preservadas por já estarem concluídas. */
    skippedDone: number;
    appliedWeights: number[];
};

/**
 * Decide, para cada série, o peso pós-deload e o patch a gravar. Núcleo PURO —
 * extraído de `applyDeloadToExercise` para poder ser testado de verdade, em vez de
 * por source-guard: era o único ponto do deload que escreve algo e não tinha
 * nenhum teste de comportamento (auditoria 2026-07-29).
 *
 * Três regras não óbvias moram aqui:
 *
 *  1. Série já CONCLUÍDA não é tocada — o peso dela é o que a pessoa levantou.
 *     Reescrever falsificava retroativamente volume, relatório e PDF.
 *  2. `weightSource: 'user'` é obrigatório no patch. O deload nasce de um modal
 *     que a pessoa confirmou, então o peso é dela. Sem essa marca a série seguia
 *     'auto' e o re-sync do autoload reescrevia a sugestão antiga por cima,
 *     desfazendo o deload em silêncio.
 *  3. A REFERÊNCIA da redução respeita a origem do peso, para os cortes não se
 *     comporem: peso assumido pelo usuário manda; peso posto pelo motor (que já
 *     pode vir descontado por prontidão e reconhecimento) cede lugar ao maior
 *     entre ele e o planejado, para a redução incidir sobre a carga cheia.
 */
export function buildDeloadPatches(input: {
    sets: DeloadSetInput[];
    ratio: number;
    minWeight: number;
    baseWeight: number;
    appliedAt: string;
    meta: { reductionPct: unknown; reason: unknown; historyCount: unknown };
}): DeloadPlan {
    const { sets, ratio, minWeight, baseWeight, appliedAt, meta } = input;
    const patches: DeloadPatch[] = [];
    const appliedWeights: number[] = [];
    let skippedDone = 0;

    for (const item of Array.isArray(sets) ? sets : []) {
        const log: UnknownRecord = isObject(item?.log) ? item.log : {};

        const doneRaw = log.done ?? log.isDone ?? log.completed ?? null;
        const alreadyDone = doneRaw === true || String(doneRaw ?? '').toLowerCase() === 'true';
        if (alreadyDone) { skippedDone += 1; continue; }

        const logWeight = extractLogWeight(log);
        const suggestion = isObject(item?.suggestion) ? item.suggestion : null;
        // Peso desta série na ÚLTIMA sessão — é a referência de "carga cheia".
        //
        // Usar o planejado do template aqui foi um erro meu: o template envelhece.
        // No Crucifixo do dono, o template dizia 70 kg mas a carga real havia caído
        // para 50; com o template como referência, "reduzir 22%" resultava em
        // 54,5 kg — o botão de DELOAD AUMENTAVA a carga. O histórico recente não
        // envelhece, então é ele que distingue os dois casos:
        //   • motor cortou HOJE (prontidão/reconhecimento): caixa < última sessão
        //     → reduz sobre a última sessão, sem compor cortes;
        //   • carga caiu de verdade: caixa ≈ última sessão → reduz sobre ela mesma.
        const lastSessionWeight = toNumber(suggestion?.weight ?? null);
        const plannedWeight = toNumber(item?.plannedWeight ?? null);
        const userOwnsWeight = String(log.weightSource ?? '') === 'user';
        const reference = userOwnsWeight && logWeight != null
            ? logWeight
            : Math.max(logWeight ?? 0, lastSessionWeight ?? 0) || plannedWeight || toNumber(baseWeight) || 0;
        if (!reference || reference <= 0) continue;

        // Invariante de sanidade: deload REDUZ. Nunca devolve peso acima da
        // referência, qualquer que seja a combinação de piso e arredondamento.
        const target = Math.min(Math.max(reference * ratio, minWeight || 0), reference);
        const nextWeight = roundToStep(target, WEIGHT_ROUND_STEP);
        const baseSetWeight = reference;
        const currentReps = log.reps;
        const currentRpe = log.rpe;
        const hasReps = String(currentReps ?? '').trim().length > 0;
        const hasRpe = String(currentRpe ?? '').trim().length > 0;

        patches.push({
            key: item.key,
            patch: {
                weight: String(nextWeight),
                weightSource: 'user',
                reps: !hasReps && suggestion?.reps != null ? String(suggestion.reps) : currentReps,
                rpe: !hasRpe && suggestion?.rpe != null ? String(suggestion.rpe) : currentRpe,
                deload: {
                    appliedAt,
                    originalWeight: baseSetWeight,
                    suggestedWeight: nextWeight,
                    reductionPct: meta?.reductionPct,
                    reason: meta?.reason,
                    historyCount: meta?.historyCount,
                },
                advanced_config: item?.cfg ?? log.advanced_config ?? null,
            },
        });
        appliedWeights.push(nextWeight);
    }

    return { patches, skippedDone, appliedWeights };
}

/**
 * Clampa o peso digitado no campo livre do modal e devolve a redução resultante.
 *
 * O campo não tinha teto superior: digitar acima do peso base fazia a razão passar
 * de 1 e o "deload" AUMENTAR a carga em todas as séries, gravado com metadado de
 * deload. Agora respeita os mesmos limites do slider (5%–40%) e o piso de 1RM.
 */
export function clampDeloadWeight(
    nextWeightRaw: number,
    baseWeight: number,
    minWeight: number,
): { weight: number; reductionPct: number } | null {
    if (!Number.isFinite(baseWeight) || baseWeight <= 0) return null;
    if (!Number.isFinite(nextWeightRaw)) return null;
    const maxAllowed = baseWeight * (1 - DELOAD_REDUCTION_MIN);
    const minAllowed = Math.max(minWeight || 0, baseWeight * (1 - DELOAD_REDUCTION_MAX));
    const bounded = clampNumber(nextWeightRaw, Math.min(minAllowed, maxAllowed), maxAllowed);
    const weight = roundToStep(bounded, WEIGHT_ROUND_STEP);
    return { weight, reductionPct: clampNumber(1 - weight / baseWeight, 0, 1) };
}

// ─── Pure Analysis Functions ──────────────────────────────────────────────────

export const analyzeDeloadHistory = (
    items: ReportHistoryItem[],
    /**
     * Treino atual (nome normalizado). Informado, a análise usa SÓ sessões deste
     * treino — e se não houver o mínimo, devolve `hasEnoughHistory: false` em vez de
     * cair no agregado.
     *
     * Sem esse recorte a análise comparava contextos diferentes: "Remada na máquina"
     * aparece em cinco treinos do dono, de 40 a 110 kg, e a alternância entre eles
     * era lida como "carga caiu" — falso positivo confirmado no aviso de 29/07.
     */
    preferWorkoutKey?: string | null,
): DeloadAnalysis => {
    const wanted = String(preferWorkoutKey ?? '').trim();
    const source = wanted
        ? (Array.isArray(items) ? items.filter((i) => String(i?.workoutKey ?? '') === wanted) : [])
        : items;
    const ordered = Array.isArray(source) ? source.slice(-DELOAD_HISTORY_SIZE) : [];
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
