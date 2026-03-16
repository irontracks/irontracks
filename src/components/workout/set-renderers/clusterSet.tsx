'use client';

import React from 'react';
import { parseTrainingNumber } from '@/utils/trainingNumber';
import { Check, Pencil } from 'lucide-react';
import { useWorkoutContext } from '../WorkoutContext';
import { HelpHint } from '@/components/ui/HelpHint';
import { HELP_TERMS } from '@/utils/help/terms';
import {
  isObject,
  buildPlannedBlocks,
  DELOAD_SUGGEST_MODE,
} from '../utils';
import { UnknownRecord, WorkoutExercise } from '../types';

export const ClusterSet = ({ ex, exIdx, setIdx }: { ex: WorkoutExercise; exIdx: number; setIdx: number }) => {
  const {
    getLog,
    updateLog,
    getPlanConfig,
    getPlannedSet,
    startTimer,
    setClusterModal,
    clusterRefs,
    deloadSuggestions,
  } = useWorkoutContext();

  const key = `${exIdx}-${setIdx}`;
  const log = getLog(key);
  const cfg = getPlanConfig(ex, setIdx);
  const restTime = parseTrainingNumber(ex?.restTime ?? ex?.rest_time);
  type DeloadEntrySuggestion = { weight?: number | null; reps?: number | null; rpe?: number | null };
  const suggestionValue = deloadSuggestions[key];
  const suggestion: DeloadEntrySuggestion | null = isObject(suggestionValue) ? (suggestionValue as DeloadEntrySuggestion) : null;
  const useWatermark = DELOAD_SUGGEST_MODE === 'watermark';
  const weightPlaceholder = useWatermark && suggestion?.weight != null ? `${suggestion.weight} kg` : 'kg';

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
  const notesValue = String(log.notes ?? '');

  return (
    <div key={key} className="space-y-2">
      <div className="rounded-xl bg-neutral-900/50 border border-neutral-800/80 px-3 py-2.5 space-y-2 shadow-sm shadow-black/20">
        <div className="flex items-center gap-2">
          <div className="w-10 text-xs font-mono text-neutral-400">#{setIdx + 1}</div>
          <input
            inputMode="decimal"
            value={String(log?.weight ?? cfg?.weight ?? '')}
            onChange={(e) => {
              const v = e?.target?.value ?? '';
              updateLog(key, { weight: v, advanced_config: cfg ?? log.advanced_config ?? null });
            }}
            placeholder={weightPlaceholder}
            className="w-24 bg-black/30 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
          />
          <button
            type="button"
            onClick={() => {
              const baseWeight = String(log?.weight ?? cfg?.weight ?? '').trim();
              const baseRpe = String(log?.rpe ?? '').trim();
              const planned = {
                total_reps: totalRepsPlanned ?? null,
                cluster_size: clusterSize ?? null,
                intra_rest_sec: intra ?? null,
              };
              const plannedBlocksModal = buildPlannedBlocks(totalRepsPlanned, clusterSize);
              const restsByGap = plannedBlocksModal.length > 1 ? Array.from({ length: plannedBlocksModal.length - 1 }).map(() => intra) : [];
              const blocksInput = plannedBlocksModal.map((plannedBlock, idx) => ({ planned: plannedBlock, weight: baseWeight, reps: blocks?.[idx] ?? null }));
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
            }}
            className="bg-black/30 border border-neutral-700 rounded-xl px-2 sm:px-3 py-2 text-sm text-white outline-none hover:border-yellow-500/60 hover:text-yellow-500 transition-colors inline-flex items-center justify-center gap-2"
          >
            <Pencil size={14} />
            <span className="text-xs font-black hidden sm:inline">Abrir</span>
          </button>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-[10px] uppercase tracking-widest font-black text-yellow-500 inline-flex items-center gap-1 group">
              Cluster
              <HelpHint title={HELP_TERMS.cluster.title} text={HELP_TERMS.cluster.text} tooltip={HELP_TERMS.cluster.tooltip} className="h-4 w-4 text-[10px]" />
            </span>
            <span className="text-xs text-neutral-400 whitespace-normal">
              {notation ? `(${notation})` : ''} • Intra {intra || 0}s • Total: {total || 0} reps
            </span>
          </div>
          <button
            type="button"
            disabled={!canDone}
            onClick={() => {
              const nowMs = Date.now();
              const startedRaw = (log as UnknownRecord)?.startedAtMs;
              const startedAtMs = typeof startedRaw === 'number' ? startedRaw : Number(String(startedRaw ?? '').trim());
              const executionSeconds =
                Number.isFinite(startedAtMs) && startedAtMs > 0 ? Math.max(0, Math.round((nowMs - startedAtMs) / 1000)) : 0;
              const nextDone = !done;
              updateLog(key, {
                done: nextDone,
                completedAtMs: nextDone ? nowMs : null,
                executionSeconds: nextDone ? executionSeconds : null,
                reps: String(total || ''),
                cluster: {
                  planned: { total_reps: totalRepsPlanned ?? null, cluster_size: clusterSize ?? null, intra_rest_sec: intra ?? null },
                  blocks,
                  last_rest_after_block: Number.isFinite(lastRestAfterBlock) ? lastRestAfterBlock : null,
                },
                advanced_config: cfg ?? log.advanced_config ?? null,
              });
              if (nextDone && restTime && restTime > 0) {
                const nextPlanned = getPlannedSet(ex, setIdx + 1);
                const nextKey = nextPlanned ? `${exIdx}-${setIdx + 1}` : null;
                startTimer(restTime, {
                  kind: 'rest',
                  key,
                  nextKey,
                  restStartedAtMs: nowMs,
                });
              }
            }}
            className={
              canDone
                ? done
                  ? 'inline-flex items-center justify-center gap-2 min-h-[40px] px-3 py-2 rounded-xl bg-yellow-500 text-black font-black shadow-yellow-500/20 shadow-sm active:scale-95 transition duration-150 sm:w-auto'
                  : 'inline-flex items-center justify-center gap-2 min-h-[40px] px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 font-bold hover:bg-neutral-700 active:scale-95 transition duration-150 sm:w-auto'
                : 'inline-flex items-center justify-center gap-2 min-h-[40px] px-3 py-2 rounded-xl bg-neutral-800/40 border border-neutral-800 text-neutral-500 font-bold cursor-not-allowed sm:w-auto'
            }
          >
            <Check size={16} />
            <span className="text-xs">{done ? 'Feito' : 'Concluir'}</span>
          </button>
        </div>
      </div>

      {plannedBlocks.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {plannedBlocks.map((planned, idx) => {
            const current = blocks?.[idx] ?? null;
            return (
              <div key={`${key}-block-${idx}`} className="bg-neutral-900/40 border border-neutral-800 rounded-xl p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[10px] uppercase tracking-widest font-bold text-neutral-400">Bloco {idx + 1}</div>
                  <div className="text-[10px] font-mono text-neutral-500">plan {String(planned)}</div>
                </div>
                <input
                  inputMode="decimal"
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
                  placeholder={useWatermark && suggestion?.reps != null && plannedBlocks.length <= 1 ? String(suggestion.reps) : 'reps'}
                  className="mt-2 w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                />
              </div>
            );
          })}
        </div>
      )}
      <textarea
        value={notesValue}
        onChange={(e) => {
          const v = e?.target?.value ?? '';
          updateLog(key, { notes: v, advanced_config: cfg ?? log.advanced_config ?? null });
        }}
        placeholder="Observações da série"
        rows={2}
        className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
      />
    </div>
  );
};
