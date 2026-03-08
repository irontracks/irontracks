'use client';

import React from 'react';
import { parseTrainingNumber } from '@/utils/trainingNumber';
import { Check, Pencil } from 'lucide-react';
import { useWorkoutContext } from '../WorkoutContext';
import { HelpHint } from '@/components/ui/HelpHint';
import {
  isObject,
  DELOAD_SUGGEST_MODE,
} from '../utils';
import { UnknownRecord, WorkoutExercise } from '../types';

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
