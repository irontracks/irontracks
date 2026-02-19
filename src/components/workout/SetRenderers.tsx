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
              const nextDone = !done;
              updateLog(key, { done: nextDone, advanced_config: cfg ?? log.advanced_config ?? null });
              if (nextDone && restTime && restTime > 0) {
                startTimer(restTime, { kind: 'rest', key });
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

export const RestPauseSet = ({ ex, exIdx, setIdx }: { ex: WorkoutExercise; exIdx: number; setIdx: number }) => {
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
  const modeLabel = String(auto?.label || '').trim() || (String(auto?.kind || '') === 'sst' ? 'SST' : 'Rest-P');

  const pauseSec = parseTrainingNumber(cfg?.rest_time_sec) ?? 15;
  const miniSets = Math.max(0, Math.floor(parseTrainingNumber(cfg?.mini_sets) ?? 0));

  const rp = isObject(log.rest_pause) ? (log.rest_pause as UnknownRecord) : ({} as UnknownRecord);
  const activation = parseTrainingNumber(rp?.activation_reps) ?? null;
  const minisArrRaw: unknown[] = Array.isArray(rp?.mini_reps) ? (rp.mini_reps as unknown[]) : [];
  const minis: Array<number | null> = Array.from({ length: miniSets }).map((_, idx) => {
    const v = minisArrRaw[idx];
    return parseTrainingNumber(v);
  });

  const total = (activation ?? 0) + minis.reduce<number>((acc, v) => acc + (typeof v === 'number' ? v : 0), 0);
  const done = !!log.done;
  const canDone = (activation ?? 0) > 0 && (miniSets === 0 || minis.every((v) => typeof v === 'number' && Number.isFinite(v) && v > 0));

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
              const nextMiniCount = Math.max(0, Math.floor(miniSets));
              const minisInput = Array.from({ length: nextMiniCount }).map((_, idx) => {
                const v = minisArrRaw?.[idx];
                const n = parseTrainingNumber(v);
                return n != null && n > 0 ? n : null;
              });
              setRestPauseModal({
                key,
                label: modeLabel,
                pauseSec,
                miniSets: nextMiniCount,
                weight: baseWeight,
                activationReps: activation != null && activation > 0 ? activation : null,
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
              const nextDone = !done;
              updateLog(key, {
                done: nextDone,
                reps: String(total || ''),
                rest_pause: { ...rp, activation_reps: activation ?? null, mini_reps: minis },
                advanced_config: cfg ?? log.advanced_config ?? null,
              });
              if (nextDone && restTime && restTime > 0) startTimer(restTime, { kind: 'rest', key });
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
              const nextDone = !done;
              updateLog(key, {
                done: nextDone,
                reps: String(total || ''),
                cluster: {
                  planned: { total_reps: totalRepsPlanned ?? null, cluster_size: clusterSize ?? null, intra_rest_sec: intra ?? null },
                  blocks,
                  last_rest_after_block: Number.isFinite(lastRestAfterBlock) ? lastRestAfterBlock : null,
                },
                advanced_config: cfg ?? log.advanced_config ?? null,
              });
              if (nextDone && restTime && restTime > 0) startTimer(restTime, { kind: 'rest', key });
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
