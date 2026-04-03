'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { parseTrainingNumber } from '@/utils/trainingNumber';
import { Check, Pencil } from 'lucide-react';
import { useWorkoutContext } from '../WorkoutContext';
import { HelpHint } from '@/components/ui/HelpHint';
import { HELP_TERMS } from '@/utils/help/terms';
import {
  isObject,
  DELOAD_SUGGEST_MODE,
  normalizeExerciseKey,
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
    exercises,
    getLog,
    updateLog,
    getPlanConfig,
    getPlannedSet,
    startTimer,
    setRestPauseModal,
    deloadSuggestions,
    reportHistory,
  } = useWorkoutContext();

  const key = `${exIdx}-${setIdx}`;
  const log = getLog(key);
  const cfg = getPlanConfig(ex, setIdx);
  const plannedSet = getPlannedSet(ex, setIdx);
  const restTime = parseTrainingNumber(ex?.restTime ?? ex?.rest_time);

  // ── Focus-aware local input state (prevents ticker re-renders from erasing typed values) ──
  function useLocalField(external: string, onSave: (v: string) => void) {
    const [local, setLocal] = useState(external);
    const focused = useRef(false);
    useEffect(() => { if (!focused.current) setLocal(external); }, [external]);
    const onChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setLocal(e.target.value); onSave(e.target.value);
    }, [onSave]);
    const onFocus = useCallback(() => { focused.current = true; }, []);
    const onBlur = useCallback((e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      focused.current = false; onSave(e.target.value);
    }, [onSave]);
    return { value: local, onChange, onFocus, onBlur };
  }

  type DeloadEntrySuggestion = { weight?: number | null; reps?: number | null; rpe?: number | null };
  const suggestionValue = deloadSuggestions[key];
  const suggestion: DeloadEntrySuggestion | null = isObject(suggestionValue) ? (suggestionValue as DeloadEntrySuggestion) : null;
  const useWatermark = DELOAD_SUGGEST_MODE === 'watermark';

  const plannedWeight = parseTrainingNumber((plannedSet as Record<string, unknown> | null)?.weight ?? ex?.weight ?? null);

  const histEntry = reportHistory?.exercises?.[normalizeExerciseKey(ex.name)];
  const lastItem = histEntry?.items?.length
    ? [...histEntry.items].sort((a, b) => b.ts - a.ts)[0]
    : null;
  const histWeight = lastItem?.setWeights?.[setIdx] ?? null;

  const weightPlaceholder = useWatermark && suggestion?.weight != null
    ? `${suggestion.weight} kg`
    : histWeight != null ? `${histWeight} kg`
    : plannedWeight != null ? `${plannedWeight} kg` : 'kg';

  const weightField = useLocalField(
    String(log?.weight ?? cfg?.weight ?? ''),
    (v) => updateLog(key, { weight: v, advanced_config: cfg ?? log.advanced_config ?? null }),
  );
  const notesExternal = String(log.notes ?? '');
  const notesField = useLocalField(
    notesExternal,
    (v) => updateLog(key, { notes: v, advanced_config: cfg ?? log.advanced_config ?? null }),
  );

  const auto = isObject(plannedSet?.it_auto) ? (plannedSet.it_auto as UnknownRecord) : null;
  // SST override takes priority for the label
  const modeLabel = sstOverride
    ? 'SST'
    : String(auto?.label || '').trim() || (String(auto?.kind || '') === 'sst' ? 'SST' : 'Rest-P');

  // SST override takes priority for config values
  const pauseSec = sstOverride ? sstOverride.restSec : (parseTrainingNumber(cfg?.rest_time_sec) ?? 15);



  const rp = isObject(log.rest_pause) ? (log.rest_pause as UnknownRecord) : ({} as UnknownRecord);
  const minisArrRaw: unknown[] = Array.isArray(rp?.mini_reps) ? (rp.mini_reps as unknown[]) : [];

  // miniSets: priority chain — sstOverride > cfg.mini_sets > log.rest_pause.planned_mini_sets > mini_reps already saved
  const miniSets = sstOverride
    ? sstOverride.miniCount
    : (() => {
      const fromCfg = Math.floor(parseTrainingNumber(cfg?.mini_sets) ?? 0)
      if (fromCfg > 0) return fromCfg
      const fromLog = Math.floor(parseTrainingNumber(rp?.planned_mini_sets) ?? 0)
      if (fromLog > 0) return fromLog
      // If mini_reps are already saved in the log, use their count
      return minisArrRaw.length
    })()

  const minis: Array<number | null> = Array.from({ length: miniSets }).map((_, idx) => {
    const v = minisArrRaw[idx];
    return parseTrainingNumber(v);
  });

  const total = minis.reduce<number>((acc, v) => acc + (typeof v === 'number' ? v : 0), 0);
  const done = !!log.done;
  // canDone: requires at least 1 mini AND all minis have positive reps
  const canDone = miniSets > 0 && minis.length > 0 && minis.every((v) => typeof v === 'number' && Number.isFinite(v) && v > 0);

  const _notesValue = String(log.notes ?? '');

  return (
    <div key={key} className="space-y-2">
      <div className="rounded-xl bg-neutral-900/50 border border-neutral-800/80 px-3 py-2.5 space-y-2 shadow-sm shadow-black/20">
        <div className="flex items-center gap-2">
          <div className="w-10 text-xs font-mono text-neutral-400">#{setIdx + 1}</div>
          <input
            inputMode="decimal"
            aria-label={`Peso em kg – série ${setIdx + 1}`}
            value={weightField.value}
            onChange={weightField.onChange}
            onFocus={weightField.onFocus}
            onBlur={weightField.onBlur}
            placeholder={weightPlaceholder}
            className="w-24 bg-black/30 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white placeholder:text-neutral-500/70 outline-none focus:ring-1 ring-yellow-500"
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
                const nextKey = nextPlanned
                  ? `${exIdx}-${setIdx + 1}`
                  : exercises[exIdx + 1] != null ? `${exIdx + 1}-0` : null;
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
                  ? 'inline-flex items-center justify-center gap-2 min-h-[40px] px-3 py-2 rounded-xl bg-emerald-500 text-black font-black shadow-sm shadow-emerald-500/30 active:scale-95 transition duration-150 sm:w-auto'
                  : 'inline-flex items-center justify-center gap-2 min-h-[40px] px-3 py-2 rounded-xl bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 font-black hover:bg-yellow-500/20 hover:border-yellow-500/50 active:scale-95 transition duration-150 sm:w-auto'
                : 'inline-flex items-center justify-center gap-2 min-h-[40px] px-3 py-2 rounded-xl bg-neutral-800/40 border border-neutral-800 text-neutral-500 font-bold cursor-not-allowed sm:w-auto'
            }
          >
            <Check size={16} />
            <span className="text-xs">{done ? 'Feito' : 'Concluir'}</span>
          </button>
        </div>
      </div>
      <textarea
        aria-label={`Observações – série ${setIdx + 1}`}
        value={notesField.value}
        onChange={notesField.onChange}
        onFocus={notesField.onFocus}
        onBlur={notesField.onBlur}
        placeholder="Observações da série"
        rows={2}
        className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
      />
    </div>
  );
};
