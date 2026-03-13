'use client';

import React from 'react';
import { parseTrainingNumber } from '@/utils/trainingNumber';
import { Check, MessageSquare } from 'lucide-react';
import { useWorkoutContext } from '../WorkoutContext';
import {
  isObject,
  DELOAD_SUGGEST_MODE,
} from '../utils';
import { UnknownRecord, WorkoutExercise } from '../types';

export const NormalSet = ({
  ex,
  exIdx,
  setIdx,
  setsCount,
}: {
  ex: WorkoutExercise;
  exIdx: number;
  setIdx: number;
  setsCount?: number;
}) => {
  const {
    getLog,
    updateLog,
    getPlanConfig,
    getPlannedSet,
    startTimer,
    openNotesKeys,
    toggleNotes,
    deloadSuggestions,
    setCollapsed,
  } = useWorkoutContext();

  const key = `${exIdx}-${setIdx}`;
  const log = getLog(key);
  const cfg = getPlanConfig(ex, setIdx);
  const plannedSet = getPlannedSet(ex, setIdx);
  const restTime = parseTrainingNumber(ex?.restTime ?? ex?.rest_time);
  const weightValue = String(log.weight ?? cfg?.weight ?? '');
  const repsValue   = String(log.reps ?? '');
  const rpeValue    = String(log.rpe ?? '');
  const notesValue  = String(log.notes ?? '');
  const done        = !!log.done;
  const plannedReps = String(plannedSet?.reps ?? ex?.reps ?? '').trim();
  const plannedRpe  = String(plannedSet?.rpe  ?? ex?.rpe  ?? '').trim();

  type DeloadEntrySuggestion = { weight?: number | null; reps?: number | null; rpe?: number | null };
  const suggestionValue = deloadSuggestions[key];
  const suggestion: DeloadEntrySuggestion | null = isObject(suggestionValue)
    ? (suggestionValue as DeloadEntrySuggestion)
    : null;
  const useWatermark     = DELOAD_SUGGEST_MODE === 'watermark';
  const weightPlaceholder = useWatermark && suggestion?.weight != null ? `${suggestion.weight} kg` : 'Peso';
  const repsPlaceholder   = useWatermark && suggestion?.reps   != null ? String(suggestion.reps)   : 'Reps';
  const rpePlaceholder    = useWatermark && suggestion?.rpe    != null ? String(suggestion.rpe)    : 'RPE';

  const notesId    = `notes-${key}`;
  const hasNotes   = notesValue.trim().length > 0;
  const isNotesOpen = openNotesKeys.has(key);

  // Shared input style — left-aligned so text is always visible
  const inputBase =
    'w-full bg-black/40 border border-neutral-700/80 rounded-xl px-2.5 py-2 text-sm text-white ' +
    'outline-none focus:ring-1 ring-yellow-500 focus:border-yellow-500/50 transition-all duration-200 ' +
    'placeholder:text-neutral-600 placeholder:text-xs focus:placeholder:opacity-0';

  const handleComplete = () => {
    const nowMs        = Date.now();
    const startedRaw   = (log as UnknownRecord)?.startedAtMs;
    const startedAtMs  =
      typeof startedRaw === 'number'
        ? startedRaw
        : Number(String(startedRaw ?? '').trim());
    const executionSeconds =
      Number.isFinite(startedAtMs) && startedAtMs > 0
        ? Math.max(0, Math.round((nowMs - startedAtMs) / 1000))
        : 0;

    const nextDone = !done;
    updateLog(key, {
      done: nextDone,
      completedAtMs:   nextDone ? nowMs : null,
      executionSeconds: nextDone ? executionSeconds : null,
      advanced_config: cfg ?? log.advanced_config ?? null,
    });

    if (nextDone && restTime && restTime > 0) {
      const nextPlanned = getPlannedSet(ex, setIdx + 1);
      const nextKey     = nextPlanned ? `${exIdx}-${setIdx + 1}` : null;
      startTimer(restTime, { kind: 'rest', key, nextKey, restStartedAtMs: nowMs });
    }

      // Auto-collapse + scroll to FIRST SET of next exercise when last set is done
    if (nextDone && setsCount != null && setIdx === setsCount - 1) {
      const delay = restTime && restTime > 0 ? 600 : 300;
      setTimeout(() => {
        try {
          setCollapsed?.((prev: Set<number>) => {
            const next = new Set(prev);
            next.add(exIdx);
            return next;
          });
          // Scroll directly to the first SET ROW of the next exercise,
          // bypassing the card header so the first input is visible immediately.
          const firstSetOfNext = document.querySelector<HTMLElement>(`[data-set-first="${exIdx + 1}"]`);
          const nextCard = document.querySelector<HTMLElement>(`[data-exercise-idx="${exIdx + 1}"]`);
          const target = firstSetOfNext ?? nextCard;
          if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch { /* silenced */ }
      }, delay);
    }
  };

  return (
    <div className="space-y-1" key={key}>
      {/* ── Single row ──────────────────────────────────────────────── */}
      <div
        {...(setIdx === 0 ? { 'data-set-first': exIdx } : {})}
        className={[
          'rounded-xl border px-2.5 py-2 transition-all duration-300 shadow-sm',
          done
            ? 'bg-emerald-950/30 border-emerald-500/30'
            : 'bg-neutral-900/50 border-neutral-800/80',
        ].join(' ')}
      >
        {/*
          Layout (CSS grid, one line):
          [badge 28px] [kg flex-3] [reps flex-2] [rpe flex-2] [💬 28px] [OK auto]
        */}
        <div className="grid items-center gap-1.5"
          style={{ gridTemplateColumns: '3fr 2fr 2fr 28px auto' }}>

          {/* kg */}
          <input
            inputMode="decimal"
            aria-label={`Peso em kg – série ${setIdx + 1}`}
            value={weightValue}
            onChange={(e) => updateLog(key, { weight: e.target.value, advanced_config: cfg ?? log.advanced_config ?? null })}
            placeholder={weightPlaceholder}
            className={inputBase}
          />

          {/* reps */}
          <div className="relative">
            <input
              inputMode="decimal"
              aria-label={`Reps – série ${setIdx + 1}`}
              value={repsValue}
              onChange={(e) => updateLog(key, { reps: e.target.value, advanced_config: cfg ?? log.advanced_config ?? null })}
              placeholder={repsPlaceholder}
              className={`${inputBase} ${plannedReps ? 'pr-6' : ''}`}
            />
            {plannedReps && (
              <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] font-mono text-neutral-500/60">
                {plannedReps}
              </span>
            )}
          </div>

          {/* RPE */}
          <div className="relative">
            <input
              inputMode="decimal"
              aria-label={`RPE – série ${setIdx + 1}`}
              value={rpeValue}
              onChange={(e) => updateLog(key, { rpe: e.target.value, advanced_config: cfg ?? log.advanced_config ?? null })}
              placeholder={rpePlaceholder}
              className={`${inputBase} text-yellow-400 border-yellow-500/25 placeholder:text-yellow-600/60 ${plannedRpe ? 'pr-6' : ''}`}
            />
            {plannedRpe && (
              <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] font-mono text-yellow-600/50">
                {plannedRpe}
              </span>
            )}
          </div>

          {/* Notes toggle */}
          <button
            type="button"
            aria-label={isNotesOpen ? 'Fechar observações' : 'Observações'}
            onClick={() => toggleNotes(key)}
            className={
              isNotesOpen || hasNotes
                ? 'w-7 h-7 inline-flex items-center justify-center rounded-lg text-yellow-500 bg-yellow-500/10 border border-yellow-500/40 hover:bg-yellow-500/15 transition duration-200'
                : 'w-7 h-7 inline-flex items-center justify-center rounded-lg text-neutral-500 bg-black/30 border border-neutral-700 hover:border-yellow-500/60 hover:text-yellow-500 transition duration-200'
            }
          >
            <MessageSquare size={12} />
          </button>

          {/* OK button */}
          <button
            type="button"
            onClick={handleComplete}
            className={[
              'inline-flex items-center justify-center gap-1 h-9 px-3 rounded-xl font-black text-xs whitespace-nowrap active:scale-95 transition-all duration-150',
              done
                ? 'bg-emerald-500 text-black shadow-sm shadow-emerald-500/30'
                : 'bg-neutral-800 border border-neutral-700 text-neutral-200 hover:bg-neutral-700 hover:border-yellow-500/40',
            ].join(' ')}
          >
            <Check size={13} />
            {done ? 'Feito' : 'OK'}
          </button>
        </div>
      </div>

      {/* Notes textarea */}
      {isNotesOpen && (
        <div className="px-1">
          <textarea
            id={notesId}
            value={notesValue}
            onChange={(e) => updateLog(key, { notes: e.target.value, advanced_config: cfg ?? log.advanced_config ?? null })}
            placeholder="Observações da série (opcional)"
            rows={2}
            className="w-full bg-black/30 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500 shadow-sm shadow-yellow-500/10 transition duration-200"
          />
        </div>
      )}
    </div>
  );
};
