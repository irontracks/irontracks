'use client';

import React from 'react';
import { Check, Clock, MessageSquare, Pencil } from 'lucide-react';
import { useWorkoutContext } from './WorkoutContext';
import { HelpHint } from '@/components/ui/HelpHint';
import { HELP_TERMS } from '@/utils/help/terms';
import { parseTrainingNumber } from '@/utils/trainingNumber';
import {
  isObject,
  toNumber,
  extractLogWeight,
  isClusterConfig,
  isRestPauseConfig,
  buildPlannedBlocks,
  DELOAD_SUGGEST_MODE,
} from './utils';
import { UnknownRecord, WorkoutExercise } from './types';

// --- Normal Set ---

export const NormalSet = ({ ex, exIdx, setIdx }: { ex: WorkoutExercise; exIdx: number; setIdx: number }) => {
  const {
    getLog,
    updateLog,
    getPlanConfig,
    getPlannedSet,
    startTimer,
    openNotesKeys,
    toggleNotes,
    deloadSuggestions,
  } = useWorkoutContext();

  const key = `${exIdx}-${setIdx}`;
  const log = getLog(key);
  const cfg = getPlanConfig(ex, setIdx);
  const plannedSet = getPlannedSet(ex, setIdx);
  const restTime = parseTrainingNumber(ex?.restTime ?? ex?.rest_time);
  const weightValue = String(log.weight ?? cfg?.weight ?? '');
  const repsValue = String(log.reps ?? '');
  const rpeValue = String(log.rpe ?? '');
  const notesValue = String(log.notes ?? '');
  const done = !!log.done;
  const plannedReps = String(plannedSet?.reps ?? ex?.reps ?? '').trim();
  const plannedRpe = String(plannedSet?.rpe ?? ex?.rpe ?? '').trim();
  
  type DeloadEntrySuggestion = { weight?: number | null; reps?: number | null; rpe?: number | null };
  const suggestionValue = deloadSuggestions[key];
  const suggestion: DeloadEntrySuggestion | null = isObject(suggestionValue) ? (suggestionValue as DeloadEntrySuggestion) : null;
  const useWatermark = DELOAD_SUGGEST_MODE === 'watermark';
  const weightPlaceholder = useWatermark && suggestion?.weight != null ? `${suggestion.weight} kg` : 'Peso (kg)';
  const repsPlaceholder = useWatermark && suggestion?.reps != null ? String(suggestion.reps) : 'Reps';
  const rpePlaceholder = useWatermark && suggestion?.rpe != null ? String(suggestion.rpe) : 'RPE';

  const isHeaderRow = setIdx === 0;
  const notesId = `notes-${key}`;
  const hasNotes = notesValue.trim().length > 0;
  const isNotesOpen = openNotesKeys.has(key);

  return (
    <div className="space-y-1" key={key}>
      {isHeaderRow && (
        <div className="hidden sm:flex items-center gap-2 text-[10px] uppercase tracking-widest text-neutral-500 font-bold px-1 group">
          <div className="w-10">Série</div>
          <div className="w-24">Peso (kg)</div>
          <div className="w-24">Reps</div>
          <div className="w-24 inline-flex items-center gap-1">
            RPE
            <HelpHint title={HELP_TERMS.rpe.title} text={HELP_TERMS.rpe.text} tooltip={HELP_TERMS.rpe.tooltip} className="h-4 w-4 text-[10px]" />
          </div>
          <div className="ml-auto flex items-center gap-2">Ações</div>
        </div>
      )}
      <div className="rounded-xl bg-neutral-900/50 border border-neutral-800/80 px-3 py-2.5 space-y-2 shadow-sm shadow-black/20">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-mono text-neutral-400">#{setIdx + 1}</div>
          <button
            type="button"
            onClick={() => toggleNotes(key)}
            className={
              isNotesOpen || hasNotes
                ? 'inline-flex items-center justify-center rounded-lg p-2 text-yellow-500 bg-yellow-500/10 border border-yellow-500/40 hover:bg-yellow-500/15 transition duration-200'
                : 'inline-flex items-center justify-center rounded-lg p-2 text-neutral-400 bg-black/30 border border-neutral-700 hover:border-yellow-500/60 hover:text-yellow-500 transition duration-200'
            }
          >
            <MessageSquare size={14} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-[6rem_6rem_6rem_auto] sm:items-center">
          <input
            inputMode="decimal"
            value={weightValue}
            onChange={(e) => {
              const v = e?.target?.value ?? '';
              updateLog(key, { weight: v, advanced_config: cfg ?? log.advanced_config ?? null });
            }}
            placeholder={weightPlaceholder}
            className="w-full bg-black/30 border border-neutral-700 rounded-xl px-3 py-1.5 text-sm text-white outline-none focus:ring-1 ring-yellow-500 transition duration-200 placeholder:text-neutral-600 placeholder:opacity-40 focus:placeholder:opacity-0"
          />
          <div className="relative">
            <input
              inputMode="decimal"
              value={repsValue}
              onChange={(e) => {
                const v = e?.target?.value ?? '';
                updateLog(key, { reps: v, advanced_config: cfg ?? log.advanced_config ?? null });
              }}
              placeholder={repsPlaceholder}
              className="w-full bg-black/30 border border-neutral-700 rounded-xl px-3 py-1.5 pr-10 text-sm text-white outline-none focus:ring-1 ring-yellow-500 transition duration-200 placeholder:text-neutral-600 placeholder:opacity-40 focus:placeholder:opacity-0"
            />
            {plannedReps ? (
              <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-neutral-500/60">
                {plannedReps}
              </div>
            ) : null}
          </div>
          <div className="relative">
            <input
              inputMode="decimal"
              value={rpeValue}
              onChange={(e) => {
                const v = e?.target?.value ?? '';
                updateLog(key, { rpe: v, advanced_config: cfg ?? log.advanced_config ?? null });
              }}
              placeholder={rpePlaceholder}
              className="w-full bg-black/30 border border-yellow-500/30 rounded-xl px-3 py-1.5 pr-10 text-sm text-yellow-500 font-bold outline-none focus:ring-1 ring-yellow-500 transition duration-200 placeholder:text-yellow-500/50 focus:placeholder:opacity-0"
            />
            {plannedRpe ? (
              <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-yellow-500/45">
                {plannedRpe}
              </div>
            ) : null}
          </div>
          <button
            type="button"
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
              done
                ? 'inline-flex items-center justify-center gap-2 min-h-[40px] px-3 py-2 rounded-xl bg-yellow-500 text-black font-black shadow-yellow-500/20 shadow-sm active:scale-95 transition duration-150'
                : 'inline-flex items-center justify-center gap-2 min-h-[40px] px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 font-bold hover:bg-neutral-700 active:scale-95 transition duration-150'
            }
          >
            <Check size={16} />
            <span className="text-xs">{done ? 'Feito' : 'Concluir'}</span>
          </button>
        </div>
      </div>
      {isNotesOpen && (
        <div className="px-1">
          <textarea
            id={notesId}
            value={notesValue}
            onChange={(e) => {
              const v = e?.target?.value ?? '';
              updateLog(key, { notes: v, advanced_config: cfg ?? log.advanced_config ?? null });
            }}
            placeholder="Observações da série (opcional)"
            rows={2}
            className="w-full bg-black/30 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500 shadow-sm shadow-yellow-500/10 transition duration-200"
          />
        </div>
      )}
    </div>
  );
};

// --- Rest Pause Set ---

export const RestPauseSet = ({
  ex, exIdx, setIdx, sstOverride,
}: {
  ex: WorkoutExercise;
  exIdx: number;
  setIdx: number;
  sstOverride?: { restSec: number; miniCount: number } | null;
}) => {
  const {
    getLog,
    updateLog,
    getPlanConfig,
    getPlannedSet,
    startTimer,
    setRestPauseModal,
    deloadSuggestions,
  } = useWorkoutContext();

  const key = `${exIdx}-${setIdx}`;
  const log = getLog(key);
  const cfg = getPlanConfig(ex, setIdx);
  const plannedSet = getPlannedSet(ex, setIdx);
  const restTime = parseTrainingNumber(ex?.restTime ?? ex?.rest_time);
  type DeloadEntrySuggestion = { weight?: number | null; reps?: number | null; rpe?: number | null };
  const suggestionValue = deloadSuggestions[key];
  const suggestion: DeloadEntrySuggestion | null = isObject(suggestionValue) ? (suggestionValue as DeloadEntrySuggestion) : null;
  const useWatermark = DELOAD_SUGGEST_MODE === 'watermark';
  const weightPlaceholder = useWatermark && suggestion?.weight != null ? `${suggestion.weight} kg` : 'kg';

  const auto = isObject(plannedSet?.it_auto) ? (plannedSet.it_auto as UnknownRecord) : null;
  // SST override takes priority for the label
  const modeLabel = sstOverride
    ? 'SST'
    : String(auto?.label || '').trim() || (String(auto?.kind || '') === 'sst' ? 'SST' : 'Rest-P');

  // SST override takes priority for config values
  const pauseSec = sstOverride ? sstOverride.restSec : (parseTrainingNumber(cfg?.rest_time_sec) ?? 15);
  const miniSets = sstOverride
    ? sstOverride.miniCount
    : Math.max(0, Math.floor(parseTrainingNumber(cfg?.mini_sets) ?? 0));

  const rp = isObject(log.rest_pause) ? (log.rest_pause as UnknownRecord) : ({} as UnknownRecord);
  const minisArrRaw: unknown[] = Array.isArray(rp?.mini_reps) ? (rp.mini_reps as unknown[]) : [];
  const minis: Array<number | null> = Array.from({ length: miniSets }).map((_, idx) => {
    const v = minisArrRaw[idx];
    return parseTrainingNumber(v);
  });

  const total = minis.reduce<number>((acc, v) => acc + (typeof v === 'number' ? v : 0), 0);
  const done = !!log.done;
  const canDone = miniSets > 0 && minis.every((v) => typeof v === 'number' && Number.isFinite(v) && v > 0);

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
              const minisInput = Array.from({ length: miniSets }).map((_, idx) => {
                const v = minisArrRaw?.[idx];
                const n = parseTrainingNumber(v);
                return n != null && n > 0 ? n : null;
              });
              setRestPauseModal({
                key,
                label: modeLabel,
                pauseSec,
                miniSets,
                weight: baseWeight,
                activationReps: null,
                minis: minisInput,
                rpe: baseRpe,
                cfg: cfg ?? null,
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
              {modeLabel === 'SST' ? 'SST' : 'Rest-P'}
              <HelpHint
                title={(modeLabel === 'SST' ? HELP_TERMS.sst : HELP_TERMS.restPause).title}
                text={(modeLabel === 'SST' ? HELP_TERMS.sst : HELP_TERMS.restPause).text}
                tooltip={(modeLabel === 'SST' ? HELP_TERMS.sst : HELP_TERMS.restPause).tooltip}
                className="h-4 w-4 text-[10px]"
              />
            </span>
            <span className="text-xs text-neutral-400 whitespace-normal">{modeLabel === 'SST' ? 'SST' : 'REST-P'} • Intra {pauseSec || 0}s • Total: {total || 0} reps</span>
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
                rest_pause: { ...rp, activation_reps: 0, mini_reps: minis },
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

// --- Cluster Set ---

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
  const plannedBlocks = buildPlannedBlocks(totalRepsPlanned, clusterSize);

  const cluster = isObject(log.cluster) ? (log.cluster as UnknownRecord) : ({} as UnknownRecord);
  const blocksRaw: unknown[] = Array.isArray(cluster.blocks) ? (cluster.blocks as unknown[]) : [];
  const blocks: Array<number | null> = plannedBlocks.map((_, idx) => parseTrainingNumber(blocksRaw[idx]));

  const total = blocks.reduce<number>((acc, v) => acc + (typeof v === 'number' ? v : 0), 0);
  const done = !!log.done;
  const canDone = plannedBlocks.length > 0 && blocks.every((v) => typeof v === 'number' && Number.isFinite(v) && v > 0);

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
    } catch {}
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

// --- Drop Set Set ---

export const DropSetSet = ({ ex, exIdx, setIdx }: { ex: WorkoutExercise; exIdx: number; setIdx: number }) => {
  const {
    getLog,
    updateLog,
    getPlannedSet,
    setDropSetModal,
    openNotesKeys,
    toggleNotes,
  } = useWorkoutContext();

  const key = `${exIdx}-${setIdx}`;
  const log = getLog(key);
  const plannedSet = getPlannedSet(ex, setIdx);
  const cfgRaw = plannedSet?.advanced_config ?? plannedSet?.advancedConfig ?? null;
  const stagesPlannedRaw: unknown[] = Array.isArray(cfgRaw) ? cfgRaw : [];
  const ds = isObject(log.drop_set) ? (log.drop_set as UnknownRecord) : ({} as UnknownRecord);
  const stagesSavedRaw: unknown[] = Array.isArray(ds.stages) ? (ds.stages as unknown[]) : [];
  const stagesCount = Math.max(stagesPlannedRaw.length, stagesSavedRaw.length);
  
  // Se não houver estágios, não deveria renderizar DropSetSet, mas retornamos null ou NormalSet (se fosse decidido assim)
  // No código original, chamava renderNormalSet se !stagesCount.
  // Aqui assumimos que o pai decide, mas se vier vazio, renderizamos NormalSet (mas não posso importar NormalSet recursivamente se for circular).
  // Vou assumir que o pai verifica. Se passar aqui com 0, vai renderizar algo estranho ou vazio.
  if (!stagesCount) {
      // Fallback para NormalSet se necessário, mas idealmente o pai controla.
      // Vou renderizar um aviso ou tentar renderizar NormalSet importando.
      // Como estão no mesmo arquivo, posso chamar NormalSet.
      return <NormalSet ex={ex} exIdx={exIdx} setIdx={setIdx} />;
  }

  const auto = isObject(plannedSet?.it_auto) ? (plannedSet.it_auto as UnknownRecord) : null;
  const modeLabel = String(auto?.label || '').trim() || 'Drop';

  const stages: Array<{ weight: string; reps: number | null }> = Array.from({ length: stagesCount }).map((_, idx) => {
    const saved = isObject(stagesSavedRaw[idx]) ? (stagesSavedRaw[idx] as UnknownRecord) : null;
    const planned = isObject(stagesPlannedRaw[idx]) ? (stagesPlannedRaw[idx] as UnknownRecord) : null;
    const weight = String(saved?.weight ?? planned?.weight ?? '').trim();
    const reps = parseTrainingNumber(saved?.reps ?? planned?.reps) ?? null;
    return { weight, reps };
  });

  const total = stages.reduce<number>((acc, s) => acc + (typeof s.reps === 'number' ? s.reps : 0), 0);
  const done = !!log.done;
  const canDone = stages.every((s) => !!String(s.weight || '').trim() && (typeof s.reps === 'number' ? s.reps : 0) > 0);

  const notesValue = String(log.notes ?? '');
  const hasNotes = notesValue.trim().length > 0;
  const isNotesOpen = openNotesKeys.has(key);

  return (
    <div key={key} className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="w-10 text-xs font-mono text-neutral-400">#{setIdx + 1}</div>
        <button
          type="button"
          onClick={() => {
            const baseStages = stages.map((s) => ({
              weight: String(s?.weight ?? '').trim(),
              reps: parseTrainingNumber(s?.reps) ?? null,
            }));
            setDropSetModal({ key, label: modeLabel, stages: baseStages, error: '' });
          }}
          className="w-24 bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none hover:border-yellow-500/60 hover:text-yellow-500 transition-colors inline-flex items-center justify-center gap-2"
        >
          <Pencil size={14} />
          <span className="text-xs font-black">Abrir</span>
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-[10px] uppercase tracking-widest font-black text-yellow-500 inline-flex items-center gap-1 group">
            {modeLabel || 'Drop'}
            <HelpHint
              title={(stagesCount >= 3 ? HELP_TERMS.dropSetDuplo : HELP_TERMS.dropSet).title}
              text={(stagesCount >= 3 ? HELP_TERMS.dropSetDuplo : HELP_TERMS.dropSet).text}
              tooltip={(stagesCount >= 3 ? HELP_TERMS.dropSetDuplo : HELP_TERMS.dropSet).tooltip}
              className="h-4 w-4 text-[10px]"
            />
          </span>
          <span className="text-xs text-neutral-400 truncate">Etapas {stagesCount} • Total: {total || 0} reps</span>
        </div>
        <button
          type="button"
          onClick={() => toggleNotes(key)}
          className={
            isNotesOpen || hasNotes
              ? 'inline-flex items-center justify-center rounded-lg p-2 text-yellow-500 bg-yellow-500/10 border border-yellow-500/40 hover:bg-yellow-500/15 transition duration-200'
              : 'inline-flex items-center justify-center rounded-lg p-2 text-neutral-400 bg-black/30 border border-neutral-700 hover:border-yellow-500/60 hover:text-yellow-500 transition duration-200'
          }
        >
          <MessageSquare size={14} />
        </button>
        <button
          type="button"
          disabled={!canDone}
          onClick={() => {
            const nextDone = !done;
            const lastWeight = String(stages?.[stages.length - 1]?.weight || '').trim();
            const stageOut = stages.map((s) => ({
              weight: String(s?.weight ?? '').trim(),
              reps: parseTrainingNumber(s?.reps) ?? null,
            }));
            updateLog(key, {
              done: nextDone,
              weight: lastWeight,
              reps: String(total || ''),
              drop_set: { stages: stageOut },
            });
          }}
          className={
            canDone
              ? done
                ? 'inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-yellow-500 text-black font-black'
                : 'inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 font-bold hover:bg-neutral-700'
              : 'inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-800/40 border border-neutral-800 text-neutral-500 font-bold cursor-not-allowed'
          }
        >
          <Check size={16} />
          <span className="text-xs">{done ? 'Feito' : 'Concluir'}</span>
        </button>
      </div>

      {!canDone && (
        <div className="pl-12 text-[11px] text-neutral-500 font-semibold">
          Preencha peso e reps em todas as etapas no modal para concluir.
        </div>
      )}

      {isNotesOpen && (
        <textarea
          value={notesValue}
          onChange={(e) => {
            const v = e?.target?.value ?? '';
            updateLog(key, { notes: v });
          }}
          placeholder="Observações da série"
          rows={2}
          className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
        />
      )}
    </div>
  );
};

// --- Stripping Set ---

export const StrippingSet = ({ ex, exIdx, setIdx }: { ex: WorkoutExercise; exIdx: number; setIdx: number }) => {
  const { getLog, updateLog, getPlannedSet, setStrippingModal, openNotesKeys, toggleNotes, startTimer } = useWorkoutContext();
  const key = `${exIdx}-${setIdx}`;
  const log = getLog(key);
  const plannedSet = getPlannedSet(ex, setIdx);
  const cfgRaw = plannedSet?.advanced_config ?? plannedSet?.advancedConfig ?? null;
  const stagesPlannedRaw: unknown[] = Array.isArray(cfgRaw) ? cfgRaw : [];
  const st = isObject(log.stripping) ? (log.stripping as UnknownRecord) : ({} as UnknownRecord);
  const stagesSavedRaw: unknown[] = Array.isArray(st.stages) ? (st.stages as unknown[]) : [];
  const defaultCount = Math.max(stagesPlannedRaw.length, stagesSavedRaw.length) || 3;

  const stages: Array<{ weight: string; reps: number | null }> = Array.from({ length: defaultCount }).map((_, idx) => {
    const saved = isObject(stagesSavedRaw[idx]) ? (stagesSavedRaw[idx] as UnknownRecord) : null;
    const planned = isObject(stagesPlannedRaw[idx]) ? (stagesPlannedRaw[idx] as UnknownRecord) : null;
    return {
      weight: String(saved?.weight ?? planned?.weight ?? '').trim(),
      reps: parseTrainingNumber(saved?.reps ?? planned?.reps) ?? null,
    };
  });

  const total = stages.reduce<number>((acc, s) => acc + (typeof s.reps === 'number' ? s.reps : 0), 0);
  const done = !!log.done;
  const canDone = stages.every((s) => !!String(s.weight || '').trim() && (typeof s.reps === 'number' ? s.reps : 0) > 0);
  const notesValue = String(log.notes ?? '');
  const hasNotes = notesValue.trim().length > 0;
  const isNotesOpen = openNotesKeys.has(key);
  const restTime = parseTrainingNumber(ex?.restTime ?? ex?.rest_time);

  return (
    <div key={key} className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="w-10 text-xs font-mono text-neutral-400">#{setIdx + 1}</div>
        <button
          type="button"
          onClick={() => setStrippingModal({ key, stages: stages.map((s) => ({ weight: s.weight, reps: s.reps ?? null })), error: '' })}
          className="w-24 bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none hover:border-yellow-500/60 hover:text-yellow-500 transition-colors inline-flex items-center justify-center gap-2"
        >
          <Pencil size={14} />
          <span className="text-xs font-black">Abrir</span>
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-[10px] uppercase tracking-widest font-black text-yellow-500">Stripping</span>
          <span className="text-xs text-neutral-400 truncate">Etapas {defaultCount} • Total: {total || 0} reps</span>
        </div>
        <button
          type="button"
          onClick={() => toggleNotes(key)}
          className={isNotesOpen || hasNotes ? 'inline-flex items-center justify-center rounded-lg p-2 text-yellow-500 bg-yellow-500/10 border border-yellow-500/40' : 'inline-flex items-center justify-center rounded-lg p-2 text-neutral-400 bg-black/30 border border-neutral-700 hover:border-yellow-500/60 hover:text-yellow-500 transition duration-200'}
        >
          <MessageSquare size={14} />
        </button>
        <button
          type="button"
          disabled={!canDone}
          onClick={() => {
            const nextDone = !done;
            const firstWeight = String(stages[0]?.weight || '').trim();
            updateLog(key, { done: nextDone, weight: firstWeight, reps: String(total || ''), stripping: { stages } });
            if (nextDone && restTime && restTime > 0) startTimer(restTime, { kind: 'rest', key, nextKey: null, restStartedAtMs: Date.now() });
          }}
          className={canDone ? done ? 'inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-yellow-500 text-black font-black' : 'inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 font-bold hover:bg-neutral-700' : 'inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-800/40 border border-neutral-800 text-neutral-500 font-bold cursor-not-allowed'}
        >
          <Check size={16} />
          <span className="text-xs">{done ? 'Feito' : 'Concluir'}</span>
        </button>
      </div>
      {!canDone && <div className="pl-12 text-[11px] text-neutral-500 font-semibold">Preencha peso e reps em todas as etapas no modal para concluir.</div>}
      {isNotesOpen && (
        <textarea value={notesValue} onChange={(e) => updateLog(key, { notes: e?.target?.value ?? '' })} placeholder="Observações da série" rows={2} className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500" />
      )}
    </div>
  );
};

// --- FST-7 Set ---

export const FST7Set = ({ ex, exIdx, setIdx }: { ex: WorkoutExercise; exIdx: number; setIdx: number }) => {
  const { getLog, updateLog, setFst7Modal, openNotesKeys, toggleNotes, startTimer } = useWorkoutContext();
  const key = `${exIdx}-${setIdx}`;
  const log = getLog(key);
  const fst7Data = isObject(log.fst7) ? (log.fst7 as UnknownRecord) : null;
  const blocksRaw: unknown[] = Array.isArray(fst7Data?.blocks) ? (fst7Data.blocks as unknown[]) : [];
  const intraSec = parseTrainingNumber(fst7Data?.intra_sec) ?? 30;

  const blocks: Array<{ weight: string; reps: number | null }> = Array.from({ length: 7 }).map((_, idx) => {
    const b = isObject(blocksRaw[idx]) ? (blocksRaw[idx] as UnknownRecord) : null;
    return { weight: String(b?.weight ?? '').trim(), reps: parseTrainingNumber(b?.reps) ?? null };
  });

  const total = blocks.reduce<number>((acc, b) => acc + (typeof b.reps === 'number' ? b.reps : 0), 0);
  const done = !!log.done;
  const canDone = blocks.every((b) => !!String(b.weight || '').trim() && (typeof b.reps === 'number' ? b.reps : 0) > 0);
  const notesValue = String(log.notes ?? '');
  const hasNotes = notesValue.trim().length > 0;
  const isNotesOpen = openNotesKeys.has(key);
  const restTime = parseTrainingNumber(ex?.restTime ?? ex?.rest_time);

  return (
    <div key={key} className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="w-10 text-xs font-mono text-neutral-400">#{setIdx + 1}</div>
        <button
          type="button"
          onClick={() => setFst7Modal({ key, blocks: blocks.map((b) => ({ weight: b.weight, reps: b.reps ?? null })), intra_sec: intraSec, error: '' })}
          className="w-24 bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none hover:border-yellow-500/60 hover:text-yellow-500 transition-colors inline-flex items-center justify-center gap-2"
        >
          <Pencil size={14} />
          <span className="text-xs font-black">Abrir</span>
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-[10px] uppercase tracking-widest font-black text-yellow-500">FST-7</span>
          <span className="text-xs text-neutral-400 truncate">7 blocos • {intraSec}s intra • {total || 0} reps total</span>
        </div>
        <button type="button" onClick={() => toggleNotes(key)} className={isNotesOpen || hasNotes ? 'inline-flex items-center justify-center rounded-lg p-2 text-yellow-500 bg-yellow-500/10 border border-yellow-500/40' : 'inline-flex items-center justify-center rounded-lg p-2 text-neutral-400 bg-black/30 border border-neutral-700 hover:border-yellow-500/60 hover:text-yellow-500 transition duration-200'}>
          <MessageSquare size={14} />
        </button>
        <button
          type="button"
          disabled={!canDone}
          onClick={() => {
            const nextDone = !done;
            const firstWeight = String(blocks[0]?.weight || '').trim();
            updateLog(key, { done: nextDone, weight: firstWeight, reps: String(total || ''), fst7: { blocks, intra_sec: intraSec } });
            if (nextDone && restTime && restTime > 0) startTimer(restTime, { kind: 'rest', key, nextKey: null, restStartedAtMs: Date.now() });
          }}
          className={canDone ? done ? 'inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-yellow-500 text-black font-black' : 'inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 font-bold hover:bg-neutral-700' : 'inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-800/40 border border-neutral-800 text-neutral-500 font-bold cursor-not-allowed'}
        >
          <Check size={16} />
          <span className="text-xs">{done ? 'Feito' : 'Concluir'}</span>
        </button>
      </div>
      {!canDone && <div className="pl-12 text-[11px] text-neutral-500 font-semibold">Preencha peso e reps em todos os 7 blocos no modal para concluir.</div>}
      {isNotesOpen && <textarea value={notesValue} onChange={(e) => updateLog(key, { notes: e?.target?.value ?? '' })} placeholder="Observações da série" rows={2} className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500" />}
    </div>
  );
};

// --- Heavy Duty Set ---

export const HeavyDutySet = ({ ex, exIdx, setIdx }: { ex: WorkoutExercise; exIdx: number; setIdx: number }) => {
  const { getLog, updateLog, setHeavyDutyModal, openNotesKeys, toggleNotes, startTimer } = useWorkoutContext();
  const key = `${exIdx}-${setIdx}`;
  const log = getLog(key);
  const hd = isObject(log.heavy_duty) ? (log.heavy_duty as UnknownRecord) : null;
  const savedWeight = String(hd?.weight ?? log.weight ?? '').trim();
  const repsFailure = parseTrainingNumber(hd?.reps_failure ?? log.reps) ?? null;
  const forcedCount = parseTrainingNumber(hd?.forced_count) ?? null;
  const negativesCount = parseTrainingNumber(hd?.negatives_count) ?? null;
  const done = !!log.done;
  const canDone = !!savedWeight && repsFailure != null && repsFailure > 0;
  const notesValue = String(log.notes ?? '');
  const hasNotes = notesValue.trim().length > 0;
  const isNotesOpen = openNotesKeys.has(key);
  const restTime = parseTrainingNumber(ex?.restTime ?? ex?.rest_time);

  const summary = canDone
    ? `${savedWeight}kg • ${repsFailure} falha${forcedCount ? ` + ${forcedCount} forçadas` : ''}${negativesCount ? ` + ${negativesCount} neg` : ''}`
    : 'Abra o modal para preencher';

  return (
    <div key={key} className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="w-10 text-xs font-mono text-neutral-400">#{setIdx + 1}</div>
        <button
          type="button"
          onClick={() => setHeavyDutyModal({ key, weight: savedWeight, reps_failure: repsFailure ?? '', forced_count: forcedCount ?? '', negatives_count: negativesCount ?? '', eccentric_sec: parseTrainingNumber(hd?.eccentric_sec) ?? '', rpe: String(hd?.rpe ?? log.rpe ?? ''), error: '' })}
          className="w-24 bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none hover:border-yellow-500/60 hover:text-yellow-500 transition-colors inline-flex items-center justify-center gap-2"
        >
          <Pencil size={14} />
          <span className="text-xs font-black">Abrir</span>
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-[10px] uppercase tracking-widest font-black text-yellow-500">Heavy Duty</span>
          <span className="text-xs text-neutral-400 truncate">{summary}</span>
        </div>
        <button type="button" onClick={() => toggleNotes(key)} className={isNotesOpen || hasNotes ? 'inline-flex items-center justify-center rounded-lg p-2 text-yellow-500 bg-yellow-500/10 border border-yellow-500/40' : 'inline-flex items-center justify-center rounded-lg p-2 text-neutral-400 bg-black/30 border border-neutral-700 hover:border-yellow-500/60 hover:text-yellow-500 transition duration-200'}>
          <MessageSquare size={14} />
        </button>
        <button
          type="button"
          disabled={!canDone}
          onClick={() => {
            const nextDone = !done;
            updateLog(key, { done: nextDone, weight: savedWeight, reps: String(repsFailure || ''), heavy_duty: hd ?? {} });
            if (nextDone && restTime && restTime > 0) startTimer(restTime, { kind: 'rest', key, nextKey: null, restStartedAtMs: Date.now() });
          }}
          className={canDone ? done ? 'inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-yellow-500 text-black font-black' : 'inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 font-bold hover:bg-neutral-700' : 'inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-800/40 border border-neutral-800 text-neutral-500 font-bold cursor-not-allowed'}
        >
          <Check size={16} />
          <span className="text-xs">{done ? 'Feito' : 'Concluir'}</span>
        </button>
      </div>
      {!canDone && <div className="pl-12 text-[11px] text-neutral-500 font-semibold">Preencha peso e reps no modal para concluir.</div>}
      {isNotesOpen && <textarea value={notesValue} onChange={(e) => updateLog(key, { notes: e?.target?.value ?? '' })} placeholder="Observações da série" rows={2} className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500" />}
    </div>
  );
};

// --- Ponto Zero Set ---

export const PontoZeroSet = ({ ex, exIdx, setIdx }: { ex: WorkoutExercise; exIdx: number; setIdx: number }) => {
  const { getLog, updateLog, setPontoZeroModal, openNotesKeys, toggleNotes, startTimer } = useWorkoutContext();
  const key = `${exIdx}-${setIdx}`;
  const log = getLog(key);
  const pz = isObject(log.ponto_zero) ? (log.ponto_zero as UnknownRecord) : null;
  const savedWeight = String(pz?.weight ?? log.weight ?? '').trim();
  const reps = parseTrainingNumber(pz?.reps ?? log.reps) ?? null;
  const holdSec = parseTrainingNumber(pz?.hold_sec) ?? 4;
  const done = !!log.done;
  const canDone = !!savedWeight && reps != null && reps > 0;
  const notesValue = String(log.notes ?? '');
  const hasNotes = notesValue.trim().length > 0;
  const isNotesOpen = openNotesKeys.has(key);
  const restTime = parseTrainingNumber(ex?.restTime ?? ex?.rest_time);

  return (
    <div key={key} className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="w-10 text-xs font-mono text-neutral-400">#{setIdx + 1}</div>
        <button
          type="button"
          onClick={() => setPontoZeroModal({ key, weight: savedWeight, reps: reps ?? '', hold_sec: holdSec, rpe: String(pz?.rpe ?? log.rpe ?? ''), error: '' })}
          className="w-24 bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none hover:border-yellow-500/60 hover:text-yellow-500 transition-colors inline-flex items-center justify-center gap-2"
        >
          <Pencil size={14} />
          <span className="text-xs font-black">Abrir</span>
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-[10px] uppercase tracking-widest font-black text-yellow-500">Ponto Zero</span>
          <span className="text-xs text-neutral-400 truncate">{canDone ? `${savedWeight}kg • ${reps} reps • ${holdSec}s hold` : 'Abra o modal para preencher'}</span>
        </div>
        <button type="button" onClick={() => toggleNotes(key)} className={isNotesOpen || hasNotes ? 'inline-flex items-center justify-center rounded-lg p-2 text-yellow-500 bg-yellow-500/10 border border-yellow-500/40' : 'inline-flex items-center justify-center rounded-lg p-2 text-neutral-400 bg-black/30 border border-neutral-700 hover:border-yellow-500/60 hover:text-yellow-500 transition duration-200'}>
          <MessageSquare size={14} />
        </button>
        <button
          type="button"
          disabled={!canDone}
          onClick={() => {
            const nextDone = !done;
            updateLog(key, { done: nextDone, weight: savedWeight, reps: String(reps || ''), ponto_zero: pz ?? {} });
            if (nextDone && restTime && restTime > 0) startTimer(restTime, { kind: 'rest', key, nextKey: null, restStartedAtMs: Date.now() });
          }}
          className={canDone ? done ? 'inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-yellow-500 text-black font-black' : 'inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 font-bold hover:bg-neutral-700' : 'inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-800/40 border border-neutral-800 text-neutral-500 font-bold cursor-not-allowed'}
        >
          <Check size={16} />
          <span className="text-xs">{done ? 'Feito' : 'Concluir'}</span>
        </button>
      </div>
      {!canDone && <div className="pl-12 text-[11px] text-neutral-500 font-semibold">Preencha peso e reps no modal para concluir.</div>}
      {isNotesOpen && <textarea value={notesValue} onChange={(e) => updateLog(key, { notes: e?.target?.value ?? '' })} placeholder="Observações da série" rows={2} className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500" />}
    </div>
  );
};

// --- Forced Reps Set ---

export const ForcedRepsSet = ({ ex, exIdx, setIdx }: { ex: WorkoutExercise; exIdx: number; setIdx: number }) => {
  const { getLog, updateLog, setForcedRepsModal, openNotesKeys, toggleNotes, startTimer } = useWorkoutContext();
  const key = `${exIdx}-${setIdx}`;
  const log = getLog(key);
  const fr = isObject(log.forced_reps) ? (log.forced_reps as UnknownRecord) : null;
  const savedWeight = String(fr?.weight ?? log.weight ?? '').trim();
  const repsFailure = parseTrainingNumber(fr?.reps_failure ?? log.reps) ?? null;
  const forcedCount = parseTrainingNumber(fr?.forced_count) ?? null;
  const done = !!log.done;
  const canDone = !!savedWeight && repsFailure != null && repsFailure > 0 && forcedCount != null && forcedCount > 0;
  const notesValue = String(log.notes ?? '');
  const hasNotes = notesValue.trim().length > 0;
  const isNotesOpen = openNotesKeys.has(key);
  const restTime = parseTrainingNumber(ex?.restTime ?? ex?.rest_time);

  return (
    <div key={key} className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="w-10 text-xs font-mono text-neutral-400">#{setIdx + 1}</div>
        <button
          type="button"
          onClick={() => setForcedRepsModal({ key, weight: savedWeight, reps_failure: repsFailure ?? '', forced_count: forcedCount ?? '', rpe: String(fr?.rpe ?? log.rpe ?? ''), error: '' })}
          className="w-24 bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none hover:border-yellow-500/60 hover:text-yellow-500 transition-colors inline-flex items-center justify-center gap-2"
        >
          <Pencil size={14} />
          <span className="text-xs font-black">Abrir</span>
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-[10px] uppercase tracking-widest font-black text-yellow-500">R. Forçadas</span>
          <span className="text-xs text-neutral-400 truncate">{canDone ? `${savedWeight}kg • ${repsFailure} falha + ${forcedCount} forçadas` : 'Abra o modal para preencher'}</span>
        </div>
        <button type="button" onClick={() => toggleNotes(key)} className={isNotesOpen || hasNotes ? 'inline-flex items-center justify-center rounded-lg p-2 text-yellow-500 bg-yellow-500/10 border border-yellow-500/40' : 'inline-flex items-center justify-center rounded-lg p-2 text-neutral-400 bg-black/30 border border-neutral-700 hover:border-yellow-500/60 hover:text-yellow-500 transition duration-200'}>
          <MessageSquare size={14} />
        </button>
        <button
          type="button"
          disabled={!canDone}
          onClick={() => {
            const nextDone = !done;
            updateLog(key, { done: nextDone, weight: savedWeight, reps: String(repsFailure || ''), forced_reps: fr ?? {} });
            if (nextDone && restTime && restTime > 0) startTimer(restTime, { kind: 'rest', key, nextKey: null, restStartedAtMs: Date.now() });
          }}
          className={canDone ? done ? 'inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-yellow-500 text-black font-black' : 'inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 font-bold hover:bg-neutral-700' : 'inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-800/40 border border-neutral-800 text-neutral-500 font-bold cursor-not-allowed'}
        >
          <Check size={16} />
          <span className="text-xs">{done ? 'Feito' : 'Concluir'}</span>
        </button>
      </div>
      {!canDone && <div className="pl-12 text-[11px] text-neutral-500 font-semibold">Preencha peso, reps à falha e reps forçadas no modal.</div>}
      {isNotesOpen && <textarea value={notesValue} onChange={(e) => updateLog(key, { notes: e?.target?.value ?? '' })} placeholder="Observações da série" rows={2} className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500" />}
    </div>
  );
};

// --- Negative Reps Set ---

export const NegativeRepsSet = ({ ex, exIdx, setIdx }: { ex: WorkoutExercise; exIdx: number; setIdx: number }) => {
  const { getLog, updateLog, setNegativeRepsModal, openNotesKeys, toggleNotes, startTimer } = useWorkoutContext();
  const key = `${exIdx}-${setIdx}`;
  const log = getLog(key);
  const nr = isObject(log.negative_reps) ? (log.negative_reps as UnknownRecord) : null;
  const savedWeight = String(nr?.weight ?? log.weight ?? '').trim();
  const reps = parseTrainingNumber(nr?.reps ?? log.reps) ?? null;
  const eccentricSec = parseTrainingNumber(nr?.eccentric_sec) ?? null;
  const done = !!log.done;
  const canDone = !!savedWeight && reps != null && reps > 0 && eccentricSec != null && eccentricSec > 0;
  const notesValue = String(log.notes ?? '');
  const hasNotes = notesValue.trim().length > 0;
  const isNotesOpen = openNotesKeys.has(key);
  const restTime = parseTrainingNumber(ex?.restTime ?? ex?.rest_time);

  return (
    <div key={key} className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="w-10 text-xs font-mono text-neutral-400">#{setIdx + 1}</div>
        <button
          type="button"
          onClick={() => setNegativeRepsModal({ key, weight: savedWeight, reps: reps ?? '', eccentric_sec: eccentricSec ?? '', rpe: String(nr?.rpe ?? log.rpe ?? ''), error: '' })}
          className="w-24 bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none hover:border-yellow-500/60 hover:text-yellow-500 transition-colors inline-flex items-center justify-center gap-2"
        >
          <Pencil size={14} />
          <span className="text-xs font-black">Abrir</span>
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-[10px] uppercase tracking-widest font-black text-yellow-500">Negativas</span>
          <span className="text-xs text-neutral-400 truncate">{canDone ? `${savedWeight}kg • ${reps} reps • ${eccentricSec}s/rep` : 'Abra o modal para preencher'}</span>
        </div>
        <button type="button" onClick={() => toggleNotes(key)} className={isNotesOpen || hasNotes ? 'inline-flex items-center justify-center rounded-lg p-2 text-yellow-500 bg-yellow-500/10 border border-yellow-500/40' : 'inline-flex items-center justify-center rounded-lg p-2 text-neutral-400 bg-black/30 border border-neutral-700 hover:border-yellow-500/60 hover:text-yellow-500 transition duration-200'}>
          <MessageSquare size={14} />
        </button>
        <button
          type="button"
          disabled={!canDone}
          onClick={() => {
            const nextDone = !done;
            updateLog(key, { done: nextDone, weight: savedWeight, reps: String(reps || ''), negative_reps: nr ?? {} });
            if (nextDone && restTime && restTime > 0) startTimer(restTime, { kind: 'rest', key, nextKey: null, restStartedAtMs: Date.now() });
          }}
          className={canDone ? done ? 'inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-yellow-500 text-black font-black' : 'inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 font-bold hover:bg-neutral-700' : 'inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-800/40 border border-neutral-800 text-neutral-500 font-bold cursor-not-allowed'}
        >
          <Check size={16} />
          <span className="text-xs">{done ? 'Feito' : 'Concluir'}</span>
        </button>
      </div>
      {!canDone && <div className="pl-12 text-[11px] text-neutral-500 font-semibold">Preencha peso, reps e tempo excêntrico no modal.</div>}
      {isNotesOpen && <textarea value={notesValue} onChange={(e) => updateLog(key, { notes: e?.target?.value ?? '' })} placeholder="Observações da série" rows={2} className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500" />}
    </div>
  );
};

// --- Partial Reps Set ---

export const PartialRepsSet = ({ ex, exIdx, setIdx }: { ex: WorkoutExercise; exIdx: number; setIdx: number }) => {
  const { getLog, updateLog, setPartialRepsModal, openNotesKeys, toggleNotes, startTimer } = useWorkoutContext();
  const key = `${exIdx}-${setIdx}`;
  const log = getLog(key);
  const pr = isObject(log.partial_reps) ? (log.partial_reps as UnknownRecord) : null;
  const savedWeight = String(pr?.weight ?? log.weight ?? '').trim();
  const fullReps = parseTrainingNumber(pr?.full_reps) ?? null;
  const partialCount = parseTrainingNumber(pr?.partial_count) ?? null;
  const done = !!log.done;
  const canDone = !!savedWeight && fullReps != null && fullReps > 0 && partialCount != null && partialCount > 0;
  const notesValue = String(log.notes ?? '');
  const hasNotes = notesValue.trim().length > 0;
  const isNotesOpen = openNotesKeys.has(key);
  const restTime = parseTrainingNumber(ex?.restTime ?? ex?.rest_time);

  return (
    <div key={key} className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="w-10 text-xs font-mono text-neutral-400">#{setIdx + 1}</div>
        <button
          type="button"
          onClick={() => setPartialRepsModal({ key, weight: savedWeight, full_reps: fullReps ?? '', partial_count: partialCount ?? '', rpe: String(pr?.rpe ?? log.rpe ?? ''), error: '' })}
          className="w-24 bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none hover:border-yellow-500/60 hover:text-yellow-500 transition-colors inline-flex items-center justify-center gap-2"
        >
          <Pencil size={14} />
          <span className="text-xs font-black">Abrir</span>
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-[10px] uppercase tracking-widest font-black text-yellow-500">Parciais</span>
          <span className="text-xs text-neutral-400 truncate">{canDone ? `${savedWeight}kg • ${fullReps} full + ${partialCount} parciais` : 'Abra o modal para preencher'}</span>
        </div>
        <button type="button" onClick={() => toggleNotes(key)} className={isNotesOpen || hasNotes ? 'inline-flex items-center justify-center rounded-lg p-2 text-yellow-500 bg-yellow-500/10 border border-yellow-500/40' : 'inline-flex items-center justify-center rounded-lg p-2 text-neutral-400 bg-black/30 border border-neutral-700 hover:border-yellow-500/60 hover:text-yellow-500 transition duration-200'}>
          <MessageSquare size={14} />
        </button>
        <button
          type="button"
          disabled={!canDone}
          onClick={() => {
            const nextDone = !done;
            updateLog(key, { done: nextDone, weight: savedWeight, reps: String((fullReps ?? 0) + (partialCount ?? 0)), partial_reps: pr ?? {} });
            if (nextDone && restTime && restTime > 0) startTimer(restTime, { kind: 'rest', key, nextKey: null, restStartedAtMs: Date.now() });
          }}
          className={canDone ? done ? 'inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-yellow-500 text-black font-black' : 'inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 font-bold hover:bg-neutral-700' : 'inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-800/40 border border-neutral-800 text-neutral-500 font-bold cursor-not-allowed'}
        >
          <Check size={16} />
          <span className="text-xs">{done ? 'Feito' : 'Concluir'}</span>
        </button>
      </div>
      {!canDone && <div className="pl-12 text-[11px] text-neutral-500 font-semibold">Preencha peso, reps completas e parciais no modal.</div>}
      {isNotesOpen && <textarea value={notesValue} onChange={(e) => updateLog(key, { notes: e?.target?.value ?? '' })} placeholder="Observações da série" rows={2} className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500" />}
    </div>
  );
};

// --- Sistema 21 Set ---

export const Sistema21Set = ({ ex, exIdx, setIdx }: { ex: WorkoutExercise; exIdx: number; setIdx: number }) => {
  const { getLog, updateLog, setSistema21Modal, openNotesKeys, toggleNotes, startTimer } = useWorkoutContext();
  const key = `${exIdx}-${setIdx}`;
  const log = getLog(key);
  const s21 = isObject(log.sistema21) ? (log.sistema21 as UnknownRecord) : null;
  const savedWeight = String(s21?.weight ?? log.weight ?? '').trim();
  const phase1 = parseTrainingNumber(s21?.phase1) ?? null;
  const phase2 = parseTrainingNumber(s21?.phase2) ?? null;
  const phase3 = parseTrainingNumber(s21?.phase3) ?? null;
  const done = !!log.done;
  const canDone = !!savedWeight && phase1 != null && phase1 > 0 && phase2 != null && phase2 > 0 && phase3 != null && phase3 > 0;
  const total = (phase1 ?? 0) + (phase2 ?? 0) + (phase3 ?? 0);
  const notesValue = String(log.notes ?? '');
  const hasNotes = notesValue.trim().length > 0;
  const isNotesOpen = openNotesKeys.has(key);
  const restTime = parseTrainingNumber(ex?.restTime ?? ex?.rest_time);

  return (
    <div key={key} className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="w-10 text-xs font-mono text-neutral-400">#{setIdx + 1}</div>
        <button
          type="button"
          onClick={() => setSistema21Modal({ key, weight: savedWeight, phase1: phase1 ?? 7, phase2: phase2 ?? 7, phase3: phase3 ?? 7, rpe: String(s21?.rpe ?? log.rpe ?? ''), error: '' })}
          className="w-24 bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none hover:border-yellow-500/60 hover:text-yellow-500 transition-colors inline-flex items-center justify-center gap-2"
        >
          <Pencil size={14} />
          <span className="text-xs font-black">Abrir</span>
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-[10px] uppercase tracking-widest font-black text-yellow-500">Sistema 21</span>
          <span className="text-xs text-neutral-400 truncate">{canDone ? `${savedWeight}kg • P1:${phase1} + P2:${phase2} + P3:${phase3} = ${total} reps` : 'Abra o modal para preencher'}</span>
        </div>
        <button type="button" onClick={() => toggleNotes(key)} className={isNotesOpen || hasNotes ? 'inline-flex items-center justify-center rounded-lg p-2 text-yellow-500 bg-yellow-500/10 border border-yellow-500/40' : 'inline-flex items-center justify-center rounded-lg p-2 text-neutral-400 bg-black/30 border border-neutral-700 hover:border-yellow-500/60 hover:text-yellow-500 transition duration-200'}>
          <MessageSquare size={14} />
        </button>
        <button
          type="button"
          disabled={!canDone}
          onClick={() => {
            const nextDone = !done;
            updateLog(key, { done: nextDone, weight: savedWeight, reps: String(total), sistema21: s21 ?? {} });
            if (nextDone && restTime && restTime > 0) startTimer(restTime, { kind: 'rest', key, nextKey: null, restStartedAtMs: Date.now() });
          }}
          className={canDone ? done ? 'inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-yellow-500 text-black font-black' : 'inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 font-bold hover:bg-neutral-700' : 'inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-800/40 border border-neutral-800 text-neutral-500 font-bold cursor-not-allowed'}
        >
          <Check size={16} />
          <span className="text-xs">{done ? 'Feito' : 'Concluir'}</span>
        </button>
      </div>
      {!canDone && <div className="pl-12 text-[11px] text-neutral-500 font-semibold">Preencha peso e reps das 3 fases no modal.</div>}
      {isNotesOpen && <textarea value={notesValue} onChange={(e) => updateLog(key, { notes: e?.target?.value ?? '' })} placeholder="Observações da série" rows={2} className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500" />}
    </div>
  );
};

// --- Wave Set ---

export const WaveSet = ({ ex, exIdx, setIdx }: { ex: WorkoutExercise; exIdx: number; setIdx: number }) => {
  const { getLog, updateLog, setWaveModal, openNotesKeys, toggleNotes, startTimer } = useWorkoutContext();
  const key = `${exIdx}-${setIdx}`;
  const log = getLog(key);
  const waveData = isObject(log.wave) ? (log.wave as UnknownRecord) : null;
  const savedWeight = String(waveData?.weight ?? log.weight ?? '').trim();
  const wavesRaw: unknown[] = Array.isArray(waveData?.waves) ? (waveData.waves as unknown[]) : [];
  const wavesCount = wavesRaw.length || 2;
  const done = !!log.done;
  const canDone = !!savedWeight && wavesRaw.length > 0 && wavesRaw.every((w) => {
    const ww = isObject(w) ? (w as UnknownRecord) : null;
    return ww && parseTrainingNumber(ww.heavy) != null && parseTrainingNumber(ww.medium) != null && parseTrainingNumber(ww.ultra) != null;
  });
  const notesValue = String(log.notes ?? '');
  const hasNotes = notesValue.trim().length > 0;
  const isNotesOpen = openNotesKeys.has(key);
  const restTime = parseTrainingNumber(ex?.restTime ?? ex?.rest_time);

  const defaultWaves = Array.from({ length: wavesCount }).map((_, idx) => {
    const existing = isObject(wavesRaw[idx]) ? (wavesRaw[idx] as UnknownRecord) : null;
    return { heavy: parseTrainingNumber(existing?.heavy) ?? 3, medium: parseTrainingNumber(existing?.medium) ?? 5, ultra: parseTrainingNumber(existing?.ultra) ?? 2 };
  });

  return (
    <div key={key} className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="w-10 text-xs font-mono text-neutral-400">#{setIdx + 1}</div>
        <button
          type="button"
          onClick={() => setWaveModal({ key, weight: savedWeight, waves: defaultWaves, rpe: String(waveData?.rpe ?? log.rpe ?? ''), error: '' })}
          className="w-24 bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none hover:border-yellow-500/60 hover:text-yellow-500 transition-colors inline-flex items-center justify-center gap-2"
        >
          <Pencil size={14} />
          <span className="text-xs font-black">Abrir</span>
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-[10px] uppercase tracking-widest font-black text-yellow-500">Onda</span>
          <span className="text-xs text-neutral-400 truncate">{canDone ? `${savedWeight}kg • ${wavesRaw.length} ondas` : 'Abra o modal para preencher'}</span>
        </div>
        <button type="button" onClick={() => toggleNotes(key)} className={isNotesOpen || hasNotes ? 'inline-flex items-center justify-center rounded-lg p-2 text-yellow-500 bg-yellow-500/10 border border-yellow-500/40' : 'inline-flex items-center justify-center rounded-lg p-2 text-neutral-400 bg-black/30 border border-neutral-700 hover:border-yellow-500/60 hover:text-yellow-500 transition duration-200'}>
          <MessageSquare size={14} />
        </button>
        <button
          type="button"
          disabled={!canDone}
          onClick={() => {
            const nextDone = !done;
            updateLog(key, { done: nextDone, weight: savedWeight, wave: waveData ?? {} });
            if (nextDone && restTime && restTime > 0) startTimer(restTime, { kind: 'rest', key, nextKey: null, restStartedAtMs: Date.now() });
          }}
          className={canDone ? done ? 'inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-yellow-500 text-black font-black' : 'inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 font-bold hover:bg-neutral-700' : 'inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-800/40 border border-neutral-800 text-neutral-500 font-bold cursor-not-allowed'}
        >
          <Check size={16} />
          <span className="text-xs">{done ? 'Feito' : 'Concluir'}</span>
        </button>
      </div>
      {!canDone && <div className="pl-12 text-[11px] text-neutral-500 font-semibold">Preencha peso e ondas no modal para concluir.</div>}
      {isNotesOpen && <textarea value={notesValue} onChange={(e) => updateLog(key, { notes: e?.target?.value ?? '' })} placeholder="Observações da série" rows={2} className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500" />}
    </div>
  );
};

// --- Group Method Set (Bi-Set / Super-Set / Tri-Set / Giant-Set / Pré-exaustão / Pós-exaustão) ---

const GROUP_METHOD_INFO: Record<string, string> = {
  'Bi-Set': '2 exercícios • mesmo grupo muscular • 0s descanso entre eles',
  'Super-Set': '2 exercícios antagonistas • 0s descanso entre eles',
  'Tri-Set': '3 exercícios mesmo grupo • 0s descanso',
  'Giant-Set': '4+ exercícios em sequência • 0s descanso',
  'Pré-exaustão': 'Isolador ANTES do composto • Execute imediatamente',
  'Pós-exaustão': 'Composto ANTES do isolador • Execute imediatamente',
};

export const GroupMethodSet = ({ ex, exIdx, setIdx }: { ex: WorkoutExercise; exIdx: number; setIdx: number }) => {
  const { getLog, updateLog, setGroupMethodModal, openNotesKeys, toggleNotes, startTimer, getPlanConfig } = useWorkoutContext();
  const key = `${exIdx}-${setIdx}`;
  const log = getLog(key);
  const cfg = getPlanConfig(ex, setIdx);
  const method = String(ex?.method || '').trim();
  const weightValue = String(log.weight ?? (isObject(cfg) ? toNumber((cfg as UnknownRecord).weight) ?? '' : '') ?? '');
  const repsValue = String(log.reps ?? '');
  const rpeValue = String(log.rpe ?? '');
  const done = !!log.done;
  const canDone = !!String(weightValue || '').trim() && !!String(repsValue || '').trim() && parseTrainingNumber(repsValue) != null && parseTrainingNumber(repsValue)! > 0;
  const notesValue = String(log.notes ?? '');
  const hasNotes = notesValue.trim().length > 0;
  const isNotesOpen = openNotesKeys.has(key);
  const restTime = parseTrainingNumber(ex?.restTime ?? ex?.rest_time);
  const plannedSet = ex?.sets ? (Array.isArray(ex.sets) ? ex.sets[setIdx] : null) : null;
  const plannedReps = String(isObject(plannedSet) ? (plannedSet as UnknownRecord).reps ?? '' : ex?.reps ?? '').trim();

  return (
    <div key={key} className="rounded-xl bg-neutral-900/50 border border-neutral-800/80 px-3 py-2.5 space-y-2 shadow-sm shadow-black/20">
      {/* Row 1: número + inputs */}
      <div className="flex items-center gap-2">
        <div className="w-8 text-xs font-mono text-neutral-400 shrink-0">#{setIdx + 1}</div>
        <input
          type="number"
          inputMode="decimal"
          value={weightValue}
          onChange={(e) => updateLog(key, { weight: e?.target?.value ?? '' })}
          placeholder="Peso (kg)"
          className="flex-1 min-w-0 bg-black/30 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
        />
        <input
          type="number"
          inputMode="numeric"
          value={repsValue}
          onChange={(e) => updateLog(key, { reps: e?.target?.value ?? '' })}
          placeholder={plannedReps || 'Reps'}
          className="w-20 shrink-0 bg-black/30 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
        />
        <input
          type="number"
          inputMode="decimal"
          value={rpeValue}
          onChange={(e) => updateLog(key, { rpe: e?.target?.value ?? '' })}
          placeholder="RPE"
          className="w-16 shrink-0 bg-black/30 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
        />
      </div>
      {/* Row 2: badge método + botões de ação */}
      <div className="flex items-center gap-2 pl-10">
        <span className="text-[10px] uppercase tracking-widest font-black text-yellow-500 flex-1 truncate">{method}</span>
        <button
          type="button"
          title={GROUP_METHOD_INFO[method] ?? method}
          onClick={() => setGroupMethodModal({ key, method, weight: weightValue, reps: repsValue, rpe: rpeValue, info: GROUP_METHOD_INFO[method] ?? '', error: '' })}
          className="inline-flex items-center justify-center rounded-lg p-2 text-neutral-400 bg-black/30 border border-neutral-700 hover:border-yellow-500/60 hover:text-yellow-500 transition duration-200"
        >
          <MessageSquare size={14} />
        </button>
        <button
          type="button"
          onClick={() => toggleNotes(key)}
          className={isNotesOpen || hasNotes ? 'inline-flex items-center justify-center rounded-lg p-2 text-yellow-500 bg-yellow-500/10 border border-yellow-500/40' : 'inline-flex items-center justify-center rounded-lg p-2 text-neutral-400 bg-black/30 border border-neutral-700 hover:border-yellow-500/60 hover:text-yellow-500 transition duration-200'}
        >
          <Pencil size={14} />
        </button>
        <button
          type="button"
          disabled={!canDone}
          onClick={() => {
            const nextDone = !done;
            updateLog(key, { done: nextDone, weight: weightValue, reps: repsValue, rpe: rpeValue });
            if (nextDone && restTime && restTime > 0) startTimer(restTime, { kind: 'rest', key, nextKey: null, restStartedAtMs: Date.now() });
          }}
          className={canDone ? done ? 'inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-yellow-500 text-black font-black' : 'inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 font-bold hover:bg-neutral-700' : 'inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-800/40 border border-neutral-800 text-neutral-500 font-bold cursor-not-allowed'}
        >
          <Check size={16} />
          <span className="text-xs">{done ? 'Feito' : 'Concluir'}</span>
        </button>
      </div>
      {isNotesOpen && (
        <textarea
          value={notesValue}
          onChange={(e) => updateLog(key, { notes: e?.target?.value ?? '' })}
          placeholder="Observações da série"
          rows={2}
          className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
        />
      )}
    </div>
  );
};
