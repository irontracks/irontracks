/**
 * useWorkoutMethodSavers.ts
 *
 * Hook que encapsula os 13 handlers `saveXxxModal` extraídos de
 * useActiveWorkoutController.ts (L1537–2066).
 *
 * Cada handler valida os dados do modal correspondente, chama updateLog
 * com o payload estruturado e fecha o modal (setXxxModal(null)).
 */

import { parseTrainingNumber } from '@/utils/trainingNumber';
import { logError } from '@/lib/logger';
import { isObject } from '../utils';
import type { UnknownRecord } from '../types';

// ─── Modal State Types (espelham os do useWorkoutModals) ─────────────────────

type SetModalFn<T> = (next: T | null | ((prev: T | null) => T | null)) => void;

export interface UseWorkoutMethodSaversProps {
    // Modal states — read-only (only need .xxx)
    clusterModal: UnknownRecord | null;
    restPauseModal: UnknownRecord | null;
    dropSetModal: UnknownRecord | null;
    strippingModal: UnknownRecord | null;
    fst7Modal: UnknownRecord | null;
    heavyDutyModal: UnknownRecord | null;
    pontoZeroModal: UnknownRecord | null;
    forcedRepsModal: UnknownRecord | null;
    negativeRepsModal: UnknownRecord | null;
    partialRepsModal: UnknownRecord | null;
    sistema21Modal: UnknownRecord | null;
    waveModal: UnknownRecord | null;
    groupMethodModal: UnknownRecord | null;

    // Modal setters
    setClusterModal: SetModalFn<UnknownRecord>;
    setRestPauseModal: SetModalFn<UnknownRecord>;
    setDropSetModal: SetModalFn<UnknownRecord>;
    setStrippingModal: SetModalFn<UnknownRecord>;
    setFst7Modal: SetModalFn<UnknownRecord>;
    setHeavyDutyModal: SetModalFn<UnknownRecord>;
    setPontoZeroModal: SetModalFn<UnknownRecord>;
    setForcedRepsModal: SetModalFn<UnknownRecord>;
    setNegativeRepsModal: SetModalFn<UnknownRecord>;
    setPartialRepsModal: SetModalFn<UnknownRecord>;
    setSistema21Modal: SetModalFn<UnknownRecord>;
    setWaveModal: SetModalFn<UnknownRecord>;
    setGroupMethodModal: SetModalFn<UnknownRecord>;

    // Log helpers
    getLog: (key: string) => UnknownRecord;
    updateLog: (key: string, patch: unknown) => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useWorkoutMethodSavers({
    clusterModal,
    restPauseModal,
    dropSetModal,
    strippingModal,
    fst7Modal,
    heavyDutyModal,
    pontoZeroModal,
    forcedRepsModal,
    negativeRepsModal,
    partialRepsModal,
    sistema21Modal,
    waveModal,
    groupMethodModal,
    setClusterModal,
    setRestPauseModal,
    setDropSetModal,
    setStrippingModal,
    setFst7Modal,
    setHeavyDutyModal,
    setPontoZeroModal,
    setForcedRepsModal,
    setNegativeRepsModal,
    setPartialRepsModal,
    setSistema21Modal,
    setWaveModal,
    setGroupMethodModal,
    getLog,
    updateLog,
}: UseWorkoutMethodSaversProps) {

    // ─── Cluster ──────────────────────────────────────────────────────────────
    const saveClusterModal = () => {
        try {
            const m = isObject(clusterModal) ? clusterModal : null;
            const key = String(m?.key || '').trim();
            if (!key) {
                setClusterModal((prev) => (prev && typeof prev === 'object' ? { ...prev, error: 'Série inválida. Feche e abra novamente.' } : prev));
                return;
            }
            const blocksRaw = m?.blocks ?? null;
            const blocks: unknown[] = Array.isArray(blocksRaw) ? blocksRaw : [];
            if (!blocks.length) {
                setClusterModal((prev) =>
                    prev && typeof prev === 'object'
                        ? { ...prev, error: 'Nenhum bloco encontrado. Verifique a configuração (total reps, cluster size e descanso).' }
                        : prev,
                );
                return;
            }
            const planned: UnknownRecord = isObject(m?.planned) ? (m.planned as UnknownRecord) : {};
            const intra = Number(m?.intra);
            const restsByGap: unknown[] = Array.isArray(m?.restsByGap) ? (m.restsByGap as unknown[]) : [];
            const done = !!getLog(key).done;
            const baseAdvanced = m?.cfg ?? getLog(key).advanced_config ?? null;

            const blocksDetailed: Array<{ weight: string; reps: number; restSecAfter: number | null }> = [];
            const repsBlocks: number[] = [];
            let total = 0;
            for (let i = 0; i < blocks.length; i += 1) {
                const b: UnknownRecord = isObject(blocks[i]) ? (blocks[i] as UnknownRecord) : {};
                const weight = String(b.weight ?? '').trim();
                const reps = parseTrainingNumber(b.reps);
                if (!weight) {
                    setClusterModal((prev) => (prev && typeof prev === 'object' ? { ...prev, error: 'Preencha o peso (kg) em todos os blocos.' } : prev));
                    return;
                }
                if (!reps || reps <= 0) {
                    setClusterModal((prev) => (prev && typeof prev === 'object' ? { ...prev, error: 'Preencha as reps em todos os blocos.' } : prev));
                    return;
                }
                const gapRest = restsByGap[i];
                const restSecAfter = i < blocks.length - 1 ? (Number.isFinite(Number(gapRest)) ? Number(gapRest) : Number.isFinite(intra) ? intra : null) : null;
                blocksDetailed.push({ weight, reps, restSecAfter });
                repsBlocks.push(reps);
                total += reps;
            }

            const lastWeight = String(blocksDetailed[blocksDetailed.length - 1]?.weight ?? '').trim();
            const rpe = String(m?.rpe ?? '').trim();

            updateLog(key, {
                done,
                weight: lastWeight,
                reps: String(total || ''),
                rpe: rpe || '',
                cluster: {
                    planned: {
                        total_reps: planned.total_reps ?? null,
                        cluster_size: planned.cluster_size ?? null,
                        cluster_blocks_count: planned.cluster_blocks_count ?? null,
                        intra_rest_sec: planned.intra_rest_sec ?? null,
                    },
                    plannedBlocks: Array.isArray(m?.plannedBlocks) ? (m.plannedBlocks as unknown[]) : null,
                    blocks: repsBlocks,
                    blocksDetailed,
                },
                advanced_config: baseAdvanced,
            });
            setClusterModal(null);
        } catch (e) { logError('hook:useWorkoutMethodSavers.saveCluster', e) }
    };

    // ─── Rest-Pause ───────────────────────────────────────────────────────────
    const saveRestPauseModal = () => {
        try {
            const m = isObject(restPauseModal) ? restPauseModal : null;
            const key = String(m?.key || '').trim();
            if (!key) {
                setRestPauseModal((prev) => (prev && typeof prev === 'object' ? { ...prev, error: 'Série inválida. Feche e abra novamente.' } : prev));
                return;
            }
            const weight = String(m?.weight ?? '').trim();
            if (!weight) {
                setRestPauseModal((prev) => (prev && typeof prev === 'object' ? { ...prev, error: 'Preencha o peso (kg).' } : prev));
                return;
            }
            const minisRaw = m?.minis ?? null;
            const minis: unknown[] = Array.isArray(minisRaw) ? minisRaw : [];
            if (minis.length === 0) {
                setRestPauseModal((prev) => (prev && typeof prev === 'object' ? { ...prev, error: 'Gere e preencha os minis antes de salvar.' } : prev));
                return;
            }
            const miniRepsParsed = minis.map((v) => {
                const n = parseTrainingNumber(v);
                return n != null && n > 0 ? n : null;
            });
            if (miniRepsParsed.some((v) => v == null)) {
                setRestPauseModal((prev) => (prev && typeof prev === 'object' ? { ...prev, error: 'Preencha as reps de todos os minis.' } : prev));
                return;
            }
            const miniReps = miniRepsParsed.filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0);
            const pauseSec = parseTrainingNumber(m?.pauseSec) ?? 15;
            const rpe = String(m?.rpe ?? '').trim();
            const cfg = m?.cfg ?? getLog(key)?.advanced_config ?? null;
            const total = miniReps.reduce((acc, v) => acc + v, 0);
            updateLog(key, {
                done: !!getLog(key)?.done,
                weight,
                reps: String(total || ''),
                rpe: rpe || '',
                rest_pause: {
                    activation_reps: 0,
                    mini_reps: miniReps,
                    rest_time_sec: pauseSec,
                    planned_mini_sets: miniReps.length,
                },
                advanced_config: cfg,
            });
            setRestPauseModal(null);
        } catch (e) { logError('hook:useWorkoutMethodSavers.saveRestPause', e) }
    };

    // ─── Drop Set ─────────────────────────────────────────────────────────────
    const saveDropSetModal = () => {
        try {
            const m = dropSetModal && typeof dropSetModal === 'object' ? dropSetModal : null;
            const key = String(m?.key || '').trim();
            if (!key) {
                setDropSetModal((prev) => (prev && typeof prev === 'object' ? { ...prev, error: 'Série inválida. Feche e abra novamente.' } : prev));
                return;
            }
            const stagesRaw = Array.isArray(m?.stages) ? m.stages : [];
            if (stagesRaw.length < 2) {
                setDropSetModal((prev) => (prev && typeof prev === 'object' ? { ...prev, error: 'Defina pelo menos 2 etapas.' } : prev));
                return;
            }
            const stages: { weight: string; reps: number }[] = [];
            let total = 0;
            for (let i = 0; i < stagesRaw.length; i += 1) {
                const s = stagesRaw[i] && typeof stagesRaw[i] === 'object' ? stagesRaw[i] : {};
                const weight = String(s?.weight ?? '').trim();
                const reps = parseTrainingNumber(s?.reps);
                if (!weight) {
                    setDropSetModal((prev) => (prev && typeof prev === 'object' ? { ...prev, error: 'Preencha o peso (kg) em todas as etapas.' } : prev));
                    return;
                }
                if (!reps || reps <= 0) {
                    setDropSetModal((prev) => (prev && typeof prev === 'object' ? { ...prev, error: 'Preencha as reps em todas as etapas.' } : prev));
                    return;
                }
                stages.push({ weight, reps });
                total += reps;
            }
            const lastWeight = String(stages[stages.length - 1]?.weight ?? '').trim();
            updateLog(key, {
                done: !!getLog(key)?.done,
                weight: lastWeight,
                reps: String(total || ''),
                drop_set: { stages },
            });
            setDropSetModal(null);
        } catch (e) { logError('hook:useWorkoutMethodSavers.saveDropSet', e) }
    };

    // ─── Stripping ────────────────────────────────────────────────────────────
    const saveStrippingModal = () => {
        try {
            const m = strippingModal && typeof strippingModal === 'object' ? strippingModal : null;
            const key = String(m?.key || '').trim();
            if (!key) {
                setStrippingModal((prev) => (prev && typeof prev === 'object' ? { ...prev, error: 'Série inválida. Feche e abra novamente.' } : prev));
                return;
            }
            const stagesRaw = Array.isArray(m?.stages) ? m.stages : [];
            if (stagesRaw.length < 2) {
                setStrippingModal((prev) => (prev && typeof prev === 'object' ? { ...prev, error: 'Defina pelo menos 2 etapas.' } : prev));
                return;
            }
            const stages: { weight: string; reps: number }[] = [];
            let total = 0;
            for (let i = 0; i < stagesRaw.length; i += 1) {
                const s = stagesRaw[i] && typeof stagesRaw[i] === 'object' ? stagesRaw[i] : {};
                const weight = String(s?.weight ?? '').trim();
                const reps = parseTrainingNumber(s?.reps);
                if (!weight) {
                    setStrippingModal((prev) => (prev && typeof prev === 'object' ? { ...prev, error: 'Preencha o peso (kg) em todas as etapas.' } : prev));
                    return;
                }
                if (!reps || reps <= 0) {
                    setStrippingModal((prev) => (prev && typeof prev === 'object' ? { ...prev, error: 'Preencha as reps em todas as etapas.' } : prev));
                    return;
                }
                stages.push({ weight, reps });
                total += reps;
            }
            const firstWeight = String(stages[0]?.weight ?? '').trim();
            updateLog(key, {
                done: !!getLog(key)?.done,
                weight: firstWeight,
                reps: String(total || ''),
                stripping: { stages },
            });
            setStrippingModal(null);
        } catch (e) { logError('hook:useWorkoutMethodSavers.saveStripping', e) }
    };

    // ─── FST-7 ────────────────────────────────────────────────────────────────
    const saveFst7Modal = () => {
        try {
            const m = fst7Modal && typeof fst7Modal === 'object' ? fst7Modal : null;
            const key = String(m?.key || '').trim();
            if (!key) {
                setFst7Modal((prev) => (prev && typeof prev === 'object' ? { ...prev, error: 'Série inválida. Feche e abra novamente.' } : prev));
                return;
            }
            const blocksRaw = Array.isArray(m?.blocks) ? m.blocks : [];
            if (blocksRaw.length !== 7) {
                setFst7Modal((prev) => (prev && typeof prev === 'object' ? { ...prev, error: 'FST-7 requer exatamente 7 blocos.' } : prev));
                return;
            }
            const blocks: { weight: string; reps: number }[] = [];
            let total = 0;
            for (let i = 0; i < blocksRaw.length; i += 1) {
                const b = blocksRaw[i] && typeof blocksRaw[i] === 'object' ? blocksRaw[i] : {};
                const weight = String(b?.weight ?? '').trim();
                const reps = parseTrainingNumber(b?.reps);
                if (!weight) {
                    setFst7Modal((prev) => (prev && typeof prev === 'object' ? { ...prev, error: 'Preencha o peso em todos os blocos.' } : prev));
                    return;
                }
                if (!reps || reps <= 0) {
                    setFst7Modal((prev) => (prev && typeof prev === 'object' ? { ...prev, error: 'Preencha as reps em todos os blocos.' } : prev));
                    return;
                }
                blocks.push({ weight, reps });
                total += reps;
            }
            const intra_sec = parseTrainingNumber(m?.intra_sec) ?? 30;
            const firstWeight = String(blocks[0]?.weight ?? '').trim();
            updateLog(key, {
                done: !!getLog(key)?.done,
                weight: firstWeight,
                reps: String(total || ''),
                fst7: { blocks, intra_sec },
            });
            setFst7Modal(null);
        } catch (e) { logError('hook:useWorkoutMethodSavers.saveFst7', e) }
    };

    // ─── Heavy Duty ───────────────────────────────────────────────────────────
    const saveHeavyDutyModal = () => {
        try {
            const m = heavyDutyModal && typeof heavyDutyModal === 'object' ? heavyDutyModal : null;
            const key = String(m?.key || '').trim();
            if (!key) {
                setHeavyDutyModal((prev) => (prev && typeof prev === 'object' ? { ...prev, error: 'Série inválida. Feche e abra novamente.' } : prev));
                return;
            }
            const weight = String(m?.weight ?? '').trim();
            const reps_failure = parseTrainingNumber(m?.reps_failure);
            if (!weight) {
                setHeavyDutyModal((prev) => (prev && typeof prev === 'object' ? { ...prev, error: 'Preencha o peso (kg).' } : prev));
                return;
            }
            if (!reps_failure || reps_failure <= 0) {
                setHeavyDutyModal((prev) => (prev && typeof prev === 'object' ? { ...prev, error: 'Preencha as reps até a falha.' } : prev));
                return;
            }
            const forced_count = parseTrainingNumber(m?.forced_count) ?? undefined;
            const negatives_count = parseTrainingNumber(m?.negatives_count) ?? undefined;
            const eccentric_sec = parseTrainingNumber(m?.eccentric_sec) ?? undefined;
            const rpe = String(m?.rpe ?? '').trim();
            const heavy_duty: UnknownRecord = { weight, reps_failure, rpe };
            if (forced_count != null) heavy_duty.forced_count = forced_count;
            if (negatives_count != null) heavy_duty.negatives_count = negatives_count;
            if (eccentric_sec != null) heavy_duty.eccentric_sec = eccentric_sec;
            updateLog(key, {
                done: !!getLog(key)?.done,
                weight,
                reps: String(reps_failure),
                rpe,
                heavy_duty,
            });
            setHeavyDutyModal(null);
        } catch (e) { logError('hook:useWorkoutMethodSavers.saveHeavyDuty', e) }
    };

    // ─── Ponto Zero ───────────────────────────────────────────────────────────
    const savePontoZeroModal = () => {
        try {
            const m = pontoZeroModal && typeof pontoZeroModal === 'object' ? pontoZeroModal : null;
            const key = String(m?.key || '').trim();
            if (!key) {
                setPontoZeroModal((prev) => (prev && typeof prev === 'object' ? { ...prev, error: 'Série inválida. Feche e abra novamente.' } : prev));
                return;
            }
            const weight = String(m?.weight ?? '').trim();
            const reps = parseTrainingNumber(m?.reps);
            if (!weight) {
                setPontoZeroModal((prev) => (prev && typeof prev === 'object' ? { ...prev, error: 'Preencha o peso (kg).' } : prev));
                return;
            }
            if (!reps || reps <= 0) {
                setPontoZeroModal((prev) => (prev && typeof prev === 'object' ? { ...prev, error: 'Preencha as reps.' } : prev));
                return;
            }
            const holdRaw = parseTrainingNumber(m?.hold_sec);
            const hold_sec = holdRaw === 3 || holdRaw === 4 || holdRaw === 5 ? holdRaw : 4;
            const rpe = String(m?.rpe ?? '').trim();
            updateLog(key, {
                done: !!getLog(key)?.done,
                weight,
                reps: String(reps),
                rpe,
                ponto_zero: { weight, reps, hold_sec, rpe },
            });
            setPontoZeroModal(null);
        } catch (e) { logError('hook:useWorkoutMethodSavers.savePontoZero', e) }
    };

    // ─── Forced Reps ─────────────────────────────────────────────────────────
    const saveForcedRepsModal = () => {
        try {
            const m = forcedRepsModal && typeof forcedRepsModal === 'object' ? forcedRepsModal : null;
            const key = String(m?.key || '').trim();
            if (!key) {
                setForcedRepsModal((prev) => (prev && typeof prev === 'object' ? { ...prev, error: 'Série inválida. Feche e abra novamente.' } : prev));
                return;
            }
            const weight = String(m?.weight ?? '').trim();
            const reps_failure = parseTrainingNumber(m?.reps_failure);
            const forced_count = parseTrainingNumber(m?.forced_count);
            if (!weight) {
                setForcedRepsModal((prev) => (prev && typeof prev === 'object' ? { ...prev, error: 'Preencha o peso (kg).' } : prev));
                return;
            }
            if (!reps_failure || reps_failure <= 0) {
                setForcedRepsModal((prev) => (prev && typeof prev === 'object' ? { ...prev, error: 'Preencha as reps até a falha.' } : prev));
                return;
            }
            if (!forced_count || forced_count <= 0) {
                setForcedRepsModal((prev) => (prev && typeof prev === 'object' ? { ...prev, error: 'Preencha as reps forçadas.' } : prev));
                return;
            }
            const rpe = String(m?.rpe ?? '').trim();
            updateLog(key, {
                done: !!getLog(key)?.done,
                weight,
                reps: String(reps_failure),
                rpe,
                forced_reps: { weight, reps_failure, forced_count, rpe },
            });
            setForcedRepsModal(null);
        } catch (e) { logError('hook:useWorkoutMethodSavers.saveForcedReps', e) }
    };

    // ─── Negative Reps ────────────────────────────────────────────────────────
    const saveNegativeRepsModal = () => {
        try {
            const m = negativeRepsModal && typeof negativeRepsModal === 'object' ? negativeRepsModal : null;
            const key = String(m?.key || '').trim();
            if (!key) {
                setNegativeRepsModal((prev) => (prev && typeof prev === 'object' ? { ...prev, error: 'Série inválida. Feche e abra novamente.' } : prev));
                return;
            }
            const weight = String(m?.weight ?? '').trim();
            const reps = parseTrainingNumber(m?.reps);
            const eccentric_sec = parseTrainingNumber(m?.eccentric_sec);
            if (!weight) {
                setNegativeRepsModal((prev) => (prev && typeof prev === 'object' ? { ...prev, error: 'Preencha o peso (kg).' } : prev));
                return;
            }
            if (!reps || reps <= 0) {
                setNegativeRepsModal((prev) => (prev && typeof prev === 'object' ? { ...prev, error: 'Preencha as reps.' } : prev));
                return;
            }
            if (!eccentric_sec || eccentric_sec <= 0) {
                setNegativeRepsModal((prev) => (prev && typeof prev === 'object' ? { ...prev, error: 'Preencha o tempo excêntrico (seg).' } : prev));
                return;
            }
            const rpe = String(m?.rpe ?? '').trim();
            updateLog(key, {
                done: !!getLog(key)?.done,
                weight,
                reps: String(reps),
                rpe,
                negative_reps: { weight, reps, eccentric_sec, rpe },
            });
            setNegativeRepsModal(null);
        } catch (e) { logError('hook:useWorkoutMethodSavers.saveNegativeReps', e) }
    };

    // ─── Partial Reps ─────────────────────────────────────────────────────────
    const savePartialRepsModal = () => {
        try {
            const m = partialRepsModal && typeof partialRepsModal === 'object' ? partialRepsModal : null;
            const key = String(m?.key || '').trim();
            if (!key) {
                setPartialRepsModal((prev) => (prev && typeof prev === 'object' ? { ...prev, error: 'Série inválida. Feche e abra novamente.' } : prev));
                return;
            }
            const weight = String(m?.weight ?? '').trim();
            const full_reps = parseTrainingNumber(m?.full_reps);
            const partial_count = parseTrainingNumber(m?.partial_count);
            if (!weight) {
                setPartialRepsModal((prev) => (prev && typeof prev === 'object' ? { ...prev, error: 'Preencha o peso (kg).' } : prev));
                return;
            }
            if (!full_reps || full_reps <= 0) {
                setPartialRepsModal((prev) => (prev && typeof prev === 'object' ? { ...prev, error: 'Preencha as reps completas.' } : prev));
                return;
            }
            if (!partial_count || partial_count <= 0) {
                setPartialRepsModal((prev) => (prev && typeof prev === 'object' ? { ...prev, error: 'Preencha as reps parciais.' } : prev));
                return;
            }
            const rpe = String(m?.rpe ?? '').trim();
            const total = full_reps + partial_count;
            updateLog(key, {
                done: !!getLog(key)?.done,
                weight,
                reps: String(total),
                rpe,
                partial_reps: { weight, full_reps, partial_count, rpe },
            });
            setPartialRepsModal(null);
        } catch (e) { logError('hook:useWorkoutMethodSavers.savePartialReps', e) }
    };

    // ─── Sistema 21 ───────────────────────────────────────────────────────────
    const saveSistema21Modal = () => {
        try {
            const m = sistema21Modal && typeof sistema21Modal === 'object' ? sistema21Modal : null;
            const key = String(m?.key || '').trim();
            if (!key) {
                setSistema21Modal((prev) => (prev && typeof prev === 'object' ? { ...prev, error: 'Série inválida. Feche e abra novamente.' } : prev));
                return;
            }
            const weight = String(m?.weight ?? '').trim();
            const phase1 = parseTrainingNumber(m?.phase1);
            const phase2 = parseTrainingNumber(m?.phase2);
            const phase3 = parseTrainingNumber(m?.phase3);
            if (!weight) {
                setSistema21Modal((prev) => (prev && typeof prev === 'object' ? { ...prev, error: 'Preencha o peso (kg).' } : prev));
                return;
            }
            if (!phase1 || phase1 <= 0 || !phase2 || phase2 <= 0 || !phase3 || phase3 <= 0) {
                setSistema21Modal((prev) => (prev && typeof prev === 'object' ? { ...prev, error: 'Preencha as reps de todas as fases.' } : prev));
                return;
            }
            const rpe = String(m?.rpe ?? '').trim();
            const total = phase1 + phase2 + phase3;
            updateLog(key, {
                done: !!getLog(key)?.done,
                weight,
                reps: String(total),
                rpe,
                sistema21: { weight, phase1, phase2, phase3, rpe },
            });
            setSistema21Modal(null);
        } catch (e) { logError('hook:useWorkoutMethodSavers.saveSistema21', e) }
    };

    // ─── Wave Loading ─────────────────────────────────────────────────────────
    const saveWaveModal = () => {
        try {
            const m = waveModal && typeof waveModal === 'object' ? waveModal : null;
            const key = String(m?.key || '').trim();
            if (!key) {
                setWaveModal((prev) => (prev && typeof prev === 'object' ? { ...prev, error: 'Série inválida. Feche e abra novamente.' } : prev));
                return;
            }
            const weight = String(m?.weight ?? '').trim();
            const wavesRaw = Array.isArray(m?.waves) ? m.waves : [];
            if (!weight) {
                setWaveModal((prev) => (prev && typeof prev === 'object' ? { ...prev, error: 'Preencha o peso (kg).' } : prev));
                return;
            }
            if (wavesRaw.length < 1) {
                setWaveModal((prev) => (prev && typeof prev === 'object' ? { ...prev, error: 'Defina pelo menos 1 onda.' } : prev));
                return;
            }
            const waves: { heavy: number; medium: number; ultra: number }[] = [];
            let total = 0;
            for (let i = 0; i < wavesRaw.length; i += 1) {
                const w = wavesRaw[i] && typeof wavesRaw[i] === 'object' ? wavesRaw[i] : {};
                const heavy = parseTrainingNumber(w?.heavy);
                const medium = parseTrainingNumber(w?.medium);
                const ultra = parseTrainingNumber(w?.ultra);
                if (!heavy || !medium || !ultra) {
                    setWaveModal((prev) => (prev && typeof prev === 'object' ? { ...prev, error: 'Preencha todas as reps de cada onda.' } : prev));
                    return;
                }
                waves.push({ heavy, medium, ultra });
                total += heavy + medium + ultra;
            }
            const rpe = String(m?.rpe ?? '').trim();
            updateLog(key, {
                done: !!getLog(key)?.done,
                weight,
                reps: String(total),
                rpe,
                wave: { weight, waves, rpe },
            });
            setWaveModal(null);
        } catch (e) { logError('hook:useWorkoutMethodSavers.saveWave', e) }
    };

    // ─── Group Method ─────────────────────────────────────────────────────────
    const saveGroupMethodModal = () => {
        try {
            const m = groupMethodModal && typeof groupMethodModal === 'object' ? groupMethodModal : null;
            const key = String(m?.key || '').trim();
            if (!key) {
                setGroupMethodModal((prev) => (prev && typeof prev === 'object' ? { ...prev, error: 'Série inválida. Feche e abra novamente.' } : prev));
                return;
            }
            const weight = String(m?.weight ?? '').trim();
            const reps = parseTrainingNumber(m?.reps);
            if (!weight) {
                setGroupMethodModal((prev) => (prev && typeof prev === 'object' ? { ...prev, error: 'Preencha o peso (kg).' } : prev));
                return;
            }
            if (!reps || reps <= 0) {
                setGroupMethodModal((prev) => (prev && typeof prev === 'object' ? { ...prev, error: 'Preencha as reps.' } : prev));
                return;
            }
            const rpe = String(m?.rpe ?? '').trim();
            updateLog(key, {
                done: !!getLog(key)?.done,
                weight,
                reps: String(reps),
                rpe,
            });
            setGroupMethodModal(null);
        } catch (e) { logError('hook:useWorkoutMethodSavers.saveGroupMethod', e) }
    };

    // ─── Return ───────────────────────────────────────────────────────────────
    return {
        saveClusterModal,
        saveRestPauseModal,
        saveDropSetModal,
        saveStrippingModal,
        saveFst7Modal,
        saveHeavyDutyModal,
        savePontoZeroModal,
        saveForcedRepsModal,
        saveNegativeRepsModal,
        savePartialRepsModal,
        saveSistema21Modal,
        saveWaveModal,
        saveGroupMethodModal,
    };
}
