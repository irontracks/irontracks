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
import { learnWeightGrid, snapToLearnedGrid } from '@/utils/autoload/machineGrid';

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

// ─── Sugestão do último treino (o que vira placeholder e, no deload, log) ─────

/** Sugestão crua vinda do histórico, antes de virar texto na tela. */
export type RawSuggestion = {
    weight?: number | null
    reps?: number | null
    rpe?: number | null
}

/**
 * Arredonda a sugestão ANTES de ela virar texto.
 *
 * `avgReps` é uma MÉDIA — 58 reps em 3 séries dá 19,333… — e o placeholder a
 * imprimia crua: "19.33333333333333" no campo de reps do modal de etapas do
 * Drop-Set (print do dono, 12/08/2026). O mesmo objeto alimenta a série normal
 * e o rest-pause, então o defeito é da FAMÍLIA, não daquele modal.
 *
 * E não é só cosmético: quando o DELOAD é aplicado numa série ainda sem reps,
 * `buildDeloadPatches` GRAVA `String(suggestion.reps)` no log — o número feio
 * entraria no `workouts.notes`, no volume e no PDF. (Varri a produção em
 * 12/08/2026: nenhum log fracionário chegou a ser gravado, mas o caminho
 * estava aberto.)
 *
 * Repetição é contagem: inteiro. Peso admite fração real (2,5 kg) mas não 12
 * casas — 2 bastam, e não mudam o deload, que rearredonda por `roundToStep`.
 */
export const roundSuggestion = (raw: RawSuggestion): RawSuggestion => {
    const round = (v: number | null | undefined, casas: number): number | null => {
        // `Number(null)` é 0, e 0 é finito: sem esta guarda, "não sei" virava
        // um "0 reps" com cara de dado (pego pelo próprio teste desta função).
        if (v == null) return null
        const n = Number(v)
        if (!Number.isFinite(n)) return null
        const f = 10 ** casas
        return Math.round(n * f) / f
    }
    return {
        weight: round(raw.weight, 2),
        reps: round(raw.reps, 0),
        rpe: round(raw.rpe, 1),
    }
}

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
    /** Séries em que nenhum peso menor era alcançável — nada foi escrito. */
    unchanged: number;
    /**
     * Redução média EFETIVA (0–1) entre as séries que receberam patch.
     *
     * É ESTE número que a tela e o log devem mostrar, nunca a porcentagem pedida
     * no modal: o pino da máquina raramente cai no alvo exato, e a diferença
     * chegou a 30 pontos percentuais em produção (auditoria de 07/09/2026).
     */
    effectiveReduction: number;
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
 *  4. Série que JÁ tem deload hoje volta ao `originalWeight` gravado antes de
 *     recalcular. Sem isso a segunda aplicação partia do peso já reduzido: não
 *     mudava nada e ainda sobrescrevia o `originalWeight` da primeira — foi assim
 *     que o Crucifixo invertido do dono ficou registrado como "de 53,5" quando a
 *     carga real dele é 70 kg (auditoria de 07/09/2026). Reaplicar agora é
 *     idempotente.
 *
 * O PISO mudou em 07/09/2026, e é a correção mais importante deste arquivo. Ele
 * era `0,5 × 1RM estimado por Epley` — ou seja, `0,5 · w · (1 + reps/30)` —, que
 * ultrapassa o alvo de −30 % em qualquer série de 12 reps ou mais. Como a base
 * treina a 12–20 reps, o piso engolia o pedido em silêncio: de 19 aplicações na
 * história do app, 6 reduziram ZERO e 8 declararam um número que não aplicaram.
 * Hoje o piso é a redução MÁXIMA que o próprio produto já anuncia no slider
 * (`DELOAD_REDUCTION_MAX`, 40 %), medida sobre a referência da série. Não é regra
 * nova: é fazer valer a que já estava na tela, em vez de um segundo limite
 * escondido que a contradizia.
 */
export function buildDeloadPatches(input: {
    sets: DeloadSetInput[];
    ratio: number;
    baseWeight: number;
    appliedAt: string;
    meta: { reductionPct: unknown; reason: unknown; historyCount: unknown };
    /**
     * Pesos já registrados neste exercício, de todas as sessões. Alimentam o grid
     * da máquina (`utils/autoload/machineGrid`), a mesma fonte que o motor de carga
     * usa para não pedir um furo de pino que não existe. Sem isto o deload
     * arredondava a 0,5 kg e propunha 60,5 / 51,5 / 37,5 kg — números que máquina
     * nenhuma tem, e que o usuário corrigia à mão em 100 % das aplicações.
     */
    knownWeights?: readonly number[] | null;
}): DeloadPlan {
    const { sets, ratio, baseWeight, appliedAt, meta, knownWeights } = input;
    const patches: DeloadPatch[] = [];
    const appliedWeights: number[] = [];
    const reducoes: number[] = [];
    let skippedDone = 0;
    let unchanged = 0;
    const grid = learnWeightGrid(knownWeights ?? null);

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
        // Regra 4: deload já aplicado hoje volta à carga cheia gravada. É o único
        // valor da série que não foi contaminado pelo próprio deload.
        const priorDeload = isObject(log.deload) ? (log.deload as UnknownRecord) : null;
        const priorOriginal = toNumber(priorDeload?.originalWeight ?? null);
        const reference = priorOriginal != null && priorOriginal > 0
            ? priorOriginal
            : userOwnsWeight && logWeight != null
                ? logWeight
                : Math.max(logWeight ?? 0, lastSessionWeight ?? 0) || plannedWeight || toNumber(baseWeight) || 0;
        if (!reference || reference <= 0) continue;

        // Invariante de sanidade: deload REDUZ. Nunca devolve peso acima da
        // referência, qualquer que seja a combinação de piso e arredondamento.
        const floor = reference * (1 - DELOAD_REDUCTION_MAX);
        const target = Math.min(Math.max(reference * ratio, floor), reference);
        // Grade da máquina primeiro (o furo do pino que existe de verdade); só
        // então o arredondamento cego de 0,5 kg. Mesma ordem do motor de carga.
        const snapped = snapToLearnedGrid(target, grid);
        // O snap desce para o degrau existente, então pode passar do alvo — o que
        // é desejável (57 em vez de 58,8). Mas não pode furar o piso: com um
        // histórico esparso o degrau abaixo pode estar MUITO longe, e o app
        // entregaria uma redução que nunca anunciou. Furou, volta ao passo cego.
        const snapUsavel = snapped != null && snapped > 0 && snapped >= floor ? snapped : null;
        const nextWeight = snapUsavel ?? roundToStep(target, WEIGHT_ROUND_STEP);
        // Nada a reduzir: não grava marca de descarga numa série que não mudou.
        // Gravar era o que fazia o relatório, o PDF e o Coach IA afirmarem uma
        // descarga que não houve — e ainda tirava a sessão da média de referência.
        if (!(nextWeight > 0) || nextWeight >= reference) { unchanged += 1; continue; }

        // Redução MEDIDA, não a pedida. O `meta.reductionPct` é a intenção do
        // modal, calculada sobre a MÉDIA do exercício; o peso desta série sai de
        // outra referência. Gravar a intenção fazia a série dizer "-30 %" tendo
        // caído 2,5 %.
        const reducaoEfetiva = 1 - nextWeight / reference;
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
                    reductionPct: Math.round(reducaoEfetiva * 1000) / 1000,
                    /** O que o usuário pediu — guardado para diagnóstico, nunca exibido como fato. */
                    requestedPct: Number(meta?.reductionPct) || null,
                    reason: meta?.reason,
                    historyCount: meta?.historyCount,
                },
                advanced_config: item?.cfg ?? log.advanced_config ?? null,
            },
        });
        appliedWeights.push(nextWeight);
        reducoes.push(reducaoEfetiva);
    }

    const effectiveReduction = reducoes.length
        ? Math.round((reducoes.reduce((a, b) => a + b, 0) / reducoes.length) * 1000) / 1000
        : 0;
    return { patches, skippedDone, appliedWeights, unchanged, effectiveReduction };
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
    const base = Array.isArray(items) ? items : [];
    const source = wanted ? base.filter((i) => String(i?.workoutKey ?? '') === wanted) : base;
    // Sessões em que o próprio app já mandou reduzir NÃO são evidência de
    // regressão — a carga caiu porque foi mandada cair. Sem este filtro o deload
    // se auto-alimenta: aplicar -22% derruba o volume muito além do limiar de 3%,
    // a análise seguinte lê "regressão" e sugere outro corte, e assim por diante.
    // O motor de carga já ignora essas sessões (useWorkoutAutoload: `if
    // (item?.deloadApplied) continue`); a análise ficava de fora da mesma regra.
    // Ficou latente enquanto ninguém aplicava deload (0 de 547 sessões até
    // jul/2026) — vira ativo no primeiro uso de verdade.
    const semDeload = source.filter((i) => i?.deloadApplied !== true);
    const ordered = semDeload.slice(-DELOAD_HISTORY_SIZE);
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

export type ExerciseDeloadAlert = {
    status: 'stagnation' | 'overtraining';
    suggestedPct: number;
    itemsCount: number;
};

export type SessionDeloadAlert = {
    exIdxs: number[];
    status: 'stagnation' | 'overtraining';
    suggestedPct: number;
    itemsCount: number;
};

/**
 * Promove os avisos POR EXERCÍCIO a uma decisão de SESSÃO.
 *
 * O diagnóstico segue por exercício (é onde o histórico vive, e estagnação
 * costuma ser local), mas a ação é do treino: a fadiga que justifica descarga é
 * sistêmica — aliviar um exercício só não descansa nada — e decidir oito vezes
 * seguidas é a explicação mais provável de a ferramenta nunca ter sido usada
 * (0 de 547 sessões concluídas até jul/2026).
 *
 * Abaixo do mínimo, devolve null e o aviso continua no card do exercício: com um
 * exercício travado o caso é local, não uma sessão inteira pedindo descanso.
 *
 * Regressão em QUALQUER exercício manda o cenário — e com ele a redução maior.
 * `itemsCount` é o MENOR entre os exercícios: é o tamanho da evidência mais
 * fraca do conjunto, e é ele que o texto mostra ao usuário.
 */
export const buildSessionDeloadAlert = (
    alerts: Record<number, ExerciseDeloadAlert>,
    minExercises: number,
    reductionOvertrain: number,
    reductionStagnation: number,
): SessionDeloadAlert | null => {
    const entries = Object.entries(alerts ?? {})
        .map(([k, v]) => [Number(k), v] as const)
        .filter(([k, v]) => Number.isFinite(k) && k >= 0 && isObject(v));
    if (entries.length < Math.max(1, minExercises)) return null;
    const temRegressao = entries.some(([, v]) => v.status === 'overtraining');
    return {
        exIdxs: entries.map(([k]) => k).sort((a, b) => a - b),
        status: temRegressao ? 'overtraining' : 'stagnation',
        suggestedPct: temRegressao ? reductionOvertrain : reductionStagnation,
        itemsCount: Math.min(...entries.map(([, v]) => Number(v.itemsCount) || 0)),
    };
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
