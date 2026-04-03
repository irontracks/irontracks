'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { parseTrainingNumber } from '@/utils/trainingNumber';
import { Check, MessageSquare } from 'lucide-react';
import { triggerHaptic } from '@/utils/native/irontracksNative';
import { useWorkoutContext } from '../WorkoutContext';
import {
  isObject,
  DELOAD_SUGGEST_MODE,
  normalizeExerciseKey,
} from '../utils';
import { UnknownRecord, WorkoutExercise } from '../types';

// ── Local-state input ─────────────────────────────────────────────────────
// The workout ticker fires every 1 s and causes a full context re-render.
// If inputs were fully controlled (value = log.xxx) every keystroke would be
// lost between the onChange call and the async setState settling.
// Fix: each field keeps its OWN local string state and only writes to the
// global log on change (for immediate persistence), but reads from local state
// so the displayed value is never clobbered by an external re-render while
// the user is typing.
function useInputField(externalValue: string, onChange: (v: string) => void) {
  const [localValue, setLocalValue] = useState(externalValue);
  const isFocused = useRef(false);

  // When the external value changes (e.g. a teammate updates the log),
  // sync the local value ONLY if the field is not currently focused.
  useEffect(() => {
    if (!isFocused.current) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLocalValue(externalValue);
    }
  }, [externalValue]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const v = e.target.value;
      setLocalValue(v);
      onChange(v);
    },
    [onChange],
  );

  const handleFocus = useCallback(() => {
    isFocused.current = true;
  }, []);

  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      isFocused.current = false;
      // Flush the final value to the global log on blur so nothing is lost
      onChange(e.target.value);
    },
    [onChange],
  );

  return { value: localValue, handleChange, handleFocus, handleBlur };
}

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
    exercises,
    getLog,
    updateLog,
    getPlanConfig,
    getPlannedSet,
    startTimer,
    openNotesKeys,
    toggleNotes,
    deloadSuggestions,
    setCollapsed,
    reportHistory,
  } = useWorkoutContext();

  const key = `${exIdx}-${setIdx}`;
  const log = getLog(key);
  const cfg = getPlanConfig(ex, setIdx);
  const plannedSet = getPlannedSet(ex, setIdx);
  const restTime = parseTrainingNumber(ex?.restTime ?? ex?.rest_time);

  // External values (from global log state)
  const extWeight = String(log.weight ?? cfg?.weight ?? '');
  const extReps   = String(log.reps   ?? '');
  const extRpe    = String(log.rpe    ?? '');
  const extNotes  = String(log.notes  ?? '');
  const done      = !!log.done;

  const plannedReps = String(plannedSet?.reps ?? ex?.reps ?? '').trim();
  const plannedRpe  = String(plannedSet?.rpe  ?? ex?.rpe  ?? '').trim();
  const plannedWeight = parseTrainingNumber((plannedSet as Record<string, unknown> | null)?.weight ?? ex?.weight ?? null);

  type DeloadEntrySuggestion = { weight?: number | null; reps?: number | null; rpe?: number | null };
  const suggestionValue = deloadSuggestions[key];
  const suggestion: DeloadEntrySuggestion | null = isObject(suggestionValue)
    ? (suggestionValue as DeloadEntrySuggestion)
    : null;
  const useWatermark = DELOAD_SUGGEST_MODE === 'watermark';

  // Last-session per-set values as watermark (from deload suggestions or direct reportHistory lookup)
  const histEntry = reportHistory?.exercises?.[normalizeExerciseKey(ex.name)];
  const lastItem = histEntry?.items?.length
    ? [...histEntry.items].sort((a, b) => b.ts - a.ts)[0]
    : null;
  const histWeight = lastItem?.setWeights?.[setIdx] ?? null;
  const histReps   = lastItem?.setReps?.[setIdx]   ?? null;
  const histRpe    = lastItem?.setRpes?.[setIdx]   ?? null;

  // Priority: deload suggestion → last-session history → planned weight from program → generic
  const weightPlaceholder = useWatermark && suggestion?.weight != null
    ? `${suggestion.weight} kg`
    : histWeight != null ? `${histWeight} kg`
    : plannedWeight != null ? `${plannedWeight} kg` : 'Peso';
  const repsPlaceholder = useWatermark && suggestion?.reps != null
    ? String(suggestion.reps)
    : histReps != null ? String(histReps) : plannedReps || 'Reps';
  const rpePlaceholder = useWatermark && suggestion?.rpe != null
    ? String(suggestion.rpe)
    : histRpe != null ? String(histRpe) : plannedRpe || 'RPE';

  const notesId    = `notes-${key}`;
  const hasNotes   = extNotes.trim().length > 0;
  const isNotesOpen = openNotesKeys.has(key);

  // ── Local input fields with focus-aware sync ──────────────────────────
  const weightField = useInputField(extWeight, (v) =>
    updateLog(key, { weight: v, advanced_config: cfg ?? log.advanced_config ?? null }),
  );
  const repsField = useInputField(extReps, (v) =>
    updateLog(key, { reps: v, advanced_config: cfg ?? log.advanced_config ?? null }),
  );
  const rpeField = useInputField(extRpe, (v) =>
    updateLog(key, { rpe: v, advanced_config: cfg ?? log.advanced_config ?? null }),
  );
  const notesField = useInputField(extNotes, (v) =>
    updateLog(key, { notes: v, advanced_config: cfg ?? log.advanced_config ?? null }),
  );

  // Shared input style — left-aligned so text is always visible
  const inputBase =
    'w-full bg-black/40 border border-neutral-700/80 rounded-xl px-2.5 py-2 text-sm text-white ' +
    'outline-none focus:ring-1 ring-yellow-500 focus:border-yellow-500/50 transition-all duration-200 ' +
    'placeholder:text-neutral-400 placeholder:text-xs focus:placeholder:opacity-0';

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
      completedAtMs:    nextDone ? nowMs : null,
      executionSeconds: nextDone ? executionSeconds : null,
      advanced_config:  cfg ?? log.advanced_config ?? null,
    });

    if (nextDone) triggerHaptic('success').catch(() => {});

    if (nextDone && restTime && restTime > 0) {
      const nextPlanned = getPlannedSet(ex, setIdx + 1);
      const nextKey = nextPlanned
        ? `${exIdx}-${setIdx + 1}`
        : exercises[exIdx + 1] != null ? `${exIdx + 1}-0` : null;
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
          [kg flex-3] [reps flex-2] [rpe flex-2] [💬 28px] [OK auto]
        */}
        <div className="grid items-center gap-1.5"
          style={{ gridTemplateColumns: '3fr 2fr 2fr 28px auto' }}>

          {/* kg */}
          <input
            inputMode="decimal"
            aria-label={`Peso em kg – série ${setIdx + 1}`}
            value={weightField.value}
            onChange={weightField.handleChange}
            onFocus={weightField.handleFocus}
            onBlur={weightField.handleBlur}
            placeholder={weightPlaceholder}
            className={inputBase}
          />

          {/* reps */}
          <div className="relative">
            <input
              inputMode="decimal"
              aria-label={`Reps – série ${setIdx + 1}`}
              value={repsField.value}
              onChange={repsField.handleChange}
              onFocus={repsField.handleFocus}
              onBlur={repsField.handleBlur}
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
              value={rpeField.value}
              onChange={rpeField.handleChange}
              onFocus={rpeField.handleFocus}
              onBlur={rpeField.handleBlur}
              placeholder={rpePlaceholder}
              className={`${inputBase} text-yellow-400 border-yellow-500/25 placeholder:text-yellow-400/50 ${plannedRpe ? 'pr-6' : ''}`}
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
          {/* eslint-disable-next-line jsx-a11y/control-has-associated-label */}
          <textarea
            id={notesId}
            value={notesField.value}
            onChange={(e) => notesField.handleChange(e as React.ChangeEvent<HTMLTextAreaElement>)}
            onFocus={() => { notesField.handleFocus(); }}
            onBlur={(e) => notesField.handleBlur(e as React.FocusEvent<HTMLTextAreaElement>)}
            placeholder="Observações da série (opcional)"
            rows={2}
            className="w-full bg-black/30 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500 shadow-sm shadow-yellow-500/10 transition duration-200"
          />
        </div>
      )}
    </div>
  );
};
