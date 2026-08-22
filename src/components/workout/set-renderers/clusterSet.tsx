'use client';

import React from 'react';
import { parseTrainingNumber } from '@/utils/trainingNumber';
import { useWorkoutContext } from '../WorkoutContext';
import { AdvancedSetRow } from './AdvancedSetRow';
import { HELP_TERMS } from '@/utils/help/terms';
import {
  isObject,
  buildPlannedBlocks,
  DELOAD_SUGGEST_MODE,
  normalizeExerciseKey,
} from '../utils';
import { UnknownRecord, WorkoutExercise } from '../types';
import { useAutoloadWeight } from '../hooks/useAutoloadWeight';
import { AutoloadNote } from './AutoloadNote';
import { PlateHintLine } from './PlateHintLine';
import { inventoryFromSettings } from '@/utils/plates/plateInventory';

const ClusterSetInner = ({ ex, exIdx, setIdx }: { ex: WorkoutExercise; exIdx: number; setIdx: number }) => {
  const {
    exercises,
    getLog,
    updateLog,
    getPlanConfig,
    getPlannedSet,
    startTimer,
    setClusterModal,
    clusterRefs,
    deloadSuggestions,
    reportHistory,
    settings,
  } = useWorkoutContext();

  const key = `${exIdx}-${setIdx}`;
  const log = getLog(key);
  const cfg = getPlanConfig(ex, setIdx);
  const { isAutoWeight, rationale: autoRationale, plateHint: autoPlateHint, autoInputClass, setUserWeight } = useAutoloadWeight(ex, exIdx, setIdx);
  const restTime = parseTrainingNumber(ex?.restTime ?? ex?.rest_time);
  type DeloadEntrySuggestion = { weight?: number | null; reps?: number | null; rpe?: number | null };
  const suggestionValue = deloadSuggestions[key];
  const suggestion: DeloadEntrySuggestion | null = isObject(suggestionValue) ? (suggestionValue as DeloadEntrySuggestion) : null;
  const useWatermark = DELOAD_SUGGEST_MODE === 'watermark';

  const plannedSet = getPlannedSet(ex, setIdx);
  const plannedWeight = parseTrainingNumber((plannedSet as Record<string, unknown> | null)?.weight ?? ex?.weight ?? null);

  const histEntry = reportHistory?.exercises?.[normalizeExerciseKey(ex.name)];
  const lastItem = histEntry?.items?.length
    ? [...histEntry.items].sort((a, b) => b.ts - a.ts)[0]
    : null;
  const histWeight = lastItem?.setWeights?.[setIdx] ?? null;
  const histReps   = lastItem?.setReps?.[setIdx]   ?? null;

  const weightPlaceholder = useWatermark && suggestion?.weight != null
    ? `${suggestion.weight} kg`
    : histWeight != null ? `${histWeight} kg`
    : plannedWeight != null ? `${plannedWeight} kg` : 'kg';

  const totalRepsPlanned = parseTrainingNumber(cfg?.total_reps);
  const clusterSize = parseTrainingNumber(cfg?.cluster_size);
  const intra = parseTrainingNumber(cfg?.intra_rest_sec) ?? 15;
  const plannedBlocksFromCfg = buildPlannedBlocks(totalRepsPlanned, clusterSize);

  const cluster = isObject(log.cluster) ? (log.cluster as UnknownRecord) : ({} as UnknownRecord);
  const blocksRaw: unknown[] = Array.isArray(cluster.blocks) ? (cluster.blocks as unknown[]) : [];

  // Use saved blocks from log when no cluster_size config exists (configured via modal's buildBlocksByCount)
  const plannedBlocks = plannedBlocksFromCfg.length > 0
    ? plannedBlocksFromCfg
    : blocksRaw.map((v) => parseTrainingNumber(v) ?? 0);

  const blocks: Array<number | null> = plannedBlocks.map((_, idx) => parseTrainingNumber(blocksRaw[idx]));

  const total = blocks.reduce<number>((acc, v) => acc + (typeof v === 'number' ? v : 0), 0);
  const done = !!log.done;
  // canDone: habilitado quando há dados suficientes para registrar a série.
  // Caminhos possíveis:
  //  (A) modal path: blocksRaw vem do saveClusterModal → basta ter ≥1 bloco válido
  //  (B) inline path: usuário preencheu os inputs diretamente → cada bloco tem valor
  const blocksSavedFromModal =
    blocksRaw.length > 0 &&
    blocksRaw.every((v) => { const n = parseTrainingNumber(v); return typeof n === 'number' && Number.isFinite(n) && n > 0; });
  const blocksFilledInline =
    plannedBlocks.length > 0 &&
    blocks.every((v) => typeof v === 'number' && Number.isFinite(v) && v > 0);
  const canDone = blocksSavedFromModal || blocksFilledInline;


  const lastRestAfterBlock = Number(cluster.last_rest_after_block);
  const lastRest = Number.isFinite(lastRestAfterBlock) ? lastRestAfterBlock : -1;

  const updateCluster = (patch: unknown) => {
    const patchObj: UnknownRecord = isObject(patch) ? patch : {};
    const nextCluster = {
      planned: { total_reps: totalRepsPlanned ?? null, cluster_size: clusterSize ?? null, intra_rest_sec: intra ?? null },
      ...cluster,
      ...patchObj,
    };
    updateLog(key, {
      cluster: nextCluster,
      reps: String(total || ''),
      done: !!log.done,
      weight: String(log.weight ?? cfg?.weight ?? ''),
      advanced_config: cfg ?? log.advanced_config ?? null,
    });
  };

  const maybeStartIntraRest = (afterBlockIndex: unknown) => {
    try {
      const idx = Number(afterBlockIndex);
      if (!Number.isFinite(idx) || idx < 0) return;
      if (idx >= plannedBlocks.length - 1) return;
      if (idx <= lastRest) return;
      if (!intra || intra <= 0) return;
      startTimer(intra, { kind: 'cluster', key, blockIndex: idx });
      updateCluster({ last_rest_after_block: idx });
    } catch { }
  };

  const notation = plannedBlocks.length ? plannedBlocks.join('+') : '';
  const savedWeight = String(log.weight ?? cfg?.weight ?? '').trim();
  const summaryText = `${savedWeight ? savedWeight + 'kg' : '—'} • ${blocks.map(b => b ?? '?').join('+')} = ${total} reps`;

  // Undo: called from the "Feito" button to toggle done back to false
  const handleUndo = () => {
    updateLog(key, {
      done: false,
      completedAtMs: null,
      executionSeconds: null,
      reps: String(total || ''),
      cluster: {
        planned: { total_reps: totalRepsPlanned ?? null, cluster_size: clusterSize ?? null, intra_rest_sec: intra ?? null },
        blocks,
        last_rest_after_block: Number.isFinite(lastRestAfterBlock) ? lastRestAfterBlock : null,
      },
      advanced_config: cfg ?? log.advanced_config ?? null,
    });
  };

  const abrirModal = () => {
    const baseWeight = String(log?.weight ?? cfg?.weight ?? plannedWeight ?? '').trim();
    const baseRpe = String(log?.rpe ?? '').trim();
    const planned = {
      total_reps: totalRepsPlanned ?? null,
      cluster_size: clusterSize ?? null,
      intra_rest_sec: intra ?? null,
    };
    const plannedBlocksModal = buildPlannedBlocks(totalRepsPlanned, clusterSize);
    const restsByGap = plannedBlocksModal.length > 1 ? Array.from({ length: plannedBlocksModal.length - 1 }).map(() => intra) : [];
    const blocksInput = plannedBlocksModal.map((plannedBlock, idx) => ({ planned: plannedBlock, weight: baseWeight, reps: blocks?.[idx] ?? plannedBlock ?? null }));
    setClusterModal({
      key,
      planned,
      plannedBlocks: plannedBlocksModal,
      intra,
      restsByGap,
      blocks: blocksInput,
      baseWeight,
      rpe: baseRpe,
      cfg: cfg ?? log.advanced_config ?? null,
      error: '',
    });
  };

  const handleConcluir = () => {
    if (done) {
      handleUndo();
      return;
    }
    // Handler de clique, não render: o `Date.now()` só corre quando o usuário
    // toca em Concluir. (Mesmo padrão dos demais renderers.)
    // eslint-disable-next-line react-hooks/purity
    const nowMs = Date.now();
    const startedRaw = (log as UnknownRecord)?.startedAtMs;
    const startedAtMs = typeof startedRaw === 'number' ? startedRaw : Number(String(startedRaw ?? '').trim());
    const executionSeconds =
      Number.isFinite(startedAtMs) && startedAtMs > 0 ? Math.max(0, Math.round((nowMs - startedAtMs) / 1000)) : 0;
    updateLog(key, {
      done: true,
      completedAtMs: nowMs,
      executionSeconds,
      reps: String(total || ''),
      cluster: {
        planned: { total_reps: totalRepsPlanned ?? null, cluster_size: clusterSize ?? null, intra_rest_sec: intra ?? null },
        blocks,
        last_rest_after_block: Number.isFinite(lastRestAfterBlock) ? lastRestAfterBlock : null,
      },
      advanced_config: cfg ?? log.advanced_config ?? null,
    });
    if (restTime && restTime > 0) {
      const nextPlanned = getPlannedSet(ex, setIdx + 1);
      const nextKey = nextPlanned
        ? `${exIdx}-${setIdx + 1}`
        : exercises[exIdx + 1] != null ? `${exIdx + 1}-0` : null;
      startTimer(restTime, { kind: 'rest', key, nextKey, restStartedAtMs: nowMs });
    }
  };

  return (
    <AdvancedSetRow
      exIdx={exIdx}
      setIdx={setIdx}
      done={done}
      canDone={canDone}
      methodLabel="Cluster"
      help={{ title: HELP_TERMS.cluster.title, text: HELP_TERMS.cluster.text, tooltip: HELP_TERMS.cluster.tooltip }}
      info={`${notation ? `(${notation}) • ` : ''}Intra ${intra || 0}s • Total: ${total || 0} reps`}
      doneSummary={summaryText}
      hint={!canDone ? 'Preencha as reps de todos os blocos para concluir.' : ''}
      onOpen={abrirModal}
      onToggleDone={handleConcluir}
      weightSlot={
        <input
          inputMode="decimal"
          aria-label={`Peso em kg – série ${setIdx + 1}`}
          value={String(log?.weight ?? cfg?.weight ?? '')}
          onChange={(e) => {
            const v = e?.target?.value ?? '';
            setUserWeight(v, { advanced_config: cfg ?? log.advanced_config ?? null });
          }}
          placeholder={weightPlaceholder}
          title={isAutoWeight ? (autoRationale || undefined) : undefined}
          className={`w-[68px] shrink-0 h-9 bg-black/30 border border-neutral-700 rounded-lg px-2 text-[16px] text-white placeholder:text-neutral-400/70 outline-none focus:ring-1 ring-yellow-500 ${autoInputClass}`}
        />
      }
    >
      <AutoloadNote show={isAutoWeight} rationale={autoRationale} plateHint={autoPlateHint} className="pl-12" />
      {/* Anilhas por lado do peso do método, que é único para os blocos. */}
      <PlateHintLine
        exerciseName={String(ex?.name ?? '')}
        weight={savedWeight}
        inventory={inventoryFromSettings(settings)}
        className="pl-12"
      />
      {!done && plannedBlocks.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {plannedBlocks.map((planned, idx) => {
            const current = blocks?.[idx] ?? null;
            return (
              <div key={`${key}-block-${idx}`} className="bg-neutral-900/40 border border-neutral-800 rounded-xl p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[10px] uppercase tracking-widest font-bold text-neutral-400">Bloco {idx + 1}</div>
                  <div className="text-[10px] font-mono text-neutral-400">plan {String(planned)}</div>
                </div>
                <input
                  inputMode="decimal"
                  aria-label={`Reps – bloco ${idx + 1}, série ${setIdx + 1}`}
                  value={current == null ? '' : String(current)}
                  ref={(el) => {
                    if (!clusterRefs.current[key]) clusterRefs.current[key] = [];
                    clusterRefs.current[key][idx] = el;
                  }}
                  onChange={(e) => {
                    const v = parseTrainingNumber(e?.target?.value);
                    const next = v != null && v > 0 ? v : null;
                    const nextBlocks = [...blocks];
                    nextBlocks[idx] = next;
                    updateCluster({ blocks: nextBlocks });
                  }}
                  onBlur={() => {
                    const cur = blocks?.[idx] ?? null;
                    const next = blocks?.[idx + 1] ?? null;
                    if (idx < plannedBlocks.length - 1 && (cur ?? 0) > 0 && (next ?? 0) <= 0) {
                      maybeStartIntraRest(idx);
                    }
                  }}
                  placeholder={useWatermark && suggestion?.reps != null && plannedBlocks.length <= 1 ? String(suggestion.reps) : histReps != null && plannedBlocks.length <= 1 ? String(histReps) : 'reps'}
                  className="mt-2 w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-[16px] text-white outline-none focus:ring-1 ring-yellow-500"
                />
              </div>
            );
          })}
        </div>
      )}
    </AdvancedSetRow>
  );
};

export const ClusterSet = React.memo(ClusterSetInner, (a, b) =>
  a.ex === b.ex && a.exIdx === b.exIdx && a.setIdx === b.setIdx,
);
