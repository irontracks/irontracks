'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { parseTrainingNumber } from '@/utils/trainingNumber';
import { Check, MessageSquare } from 'lucide-react';
import { useWorkoutContext } from '../WorkoutContext';
import {
  isObject,
  DELOAD_SUGGEST_MODE,
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
  // Track when the field was last blurred so we can protect against stale
  // external values arriving before React processes the blur's state update.
  const blurredAtRef = useRef(0);

  // When the external value changes (e.g. a teammate updates the log),
  // sync the local value ONLY if the field is not currently focused.
  useEffect(() => {
    if (isFocused.current) return;
    // Guard: if we JUST blurred and local has data but external is empty/different,
    // the external value is likely stale (React hasn't processed our blur write yet).
    // Wait for a render cycle before accepting the downgrade.
    if (
      localValue &&
      !externalValue &&
      Date.now() - blurredAtRef.current < 2000
    ) {
      return;
    }
    setLocalValue(externalValue);
  // localValue intentionally excluded — we only react to external changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
      blurredAtRef.current = Date.now();
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

  // Guard against double-tap toggling the done state back
  const completeBusyRef = useRef(false);

  const key = `${exIdx}-${setIdx}`;
  const log = getLog(key);
  const cfg = getPlanConfig(ex, setIdx);
  const plannedSet = getPlannedSet(ex, setIdx);
  const restTime = parseTrainingNumber(ex?.restTime ?? ex?.rest_time);

  // Unilateral support
  const isUnilateral = !!(ex?.isUnilateral ?? (ex as Record<string, unknown>)?.is_unilateral);
  const sideRestTime = parseTrainingNumber((ex as Record<string, unknown>)?.sideRestTime ?? (ex as Record<string, unknown>)?.side_rest_time) ?? 15;
  const activeSide   = log.activeSide === 'R' ? 'R' : 'L';
  const lDone        = !!log.L_done;

  // External values (from global log state)
  const extWeight = String(log.weight ?? cfg?.weight ?? '');
  const extReps   = String(log.reps   ?? '');
  const extLReps  = String(log.L_reps ?? log.reps ?? '');
  const extRReps  = String(log.R_reps ?? '');
  const extRpe    = String(log.rpe    ?? '');
  const extNotes  = String(log.notes  ?? '');
  const done      = !!log.done;

  const plannedReps = String(plannedSet?.reps ?? ex?.reps ?? '').trim();
  const plannedRpe  = String(plannedSet?.rpe  ?? ex?.rpe  ?? '').trim();

  type DeloadEntrySuggestion = { weight?: number | null; reps?: number | null; rpe?: number | null };
  const suggestionValue = deloadSuggestions[key];
  const suggestion: DeloadEntrySuggestion | null = isObject(suggestionValue)
    ? (suggestionValue as DeloadEntrySuggestion)
    : null;
  const useWatermark      = DELOAD_SUGGEST_MODE === 'watermark';
  const weightPlaceholder = useWatermark && suggestion?.weight != null ? `${suggestion.weight} kg` : 'Peso';
  const repsPlaceholder   = useWatermark && suggestion?.reps   != null ? String(suggestion.reps)   : 'Reps';
  const rpePlaceholder    = useWatermark && suggestion?.rpe    != null ? String(suggestion.rpe)    : 'RPE';

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
  const lRepsField = useInputField(extLReps, (v) =>
    updateLog(key, { L_reps: v }),
  );
  const rRepsField = useInputField(extRReps, (v) =>
    updateLog(key, { R_reps: v }),
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
    'placeholder:text-neutral-600 placeholder:text-xs focus:placeholder:opacity-0';

  const collapseAndScroll = (delay: number) => {
    setTimeout(() => {
      try {
        flushSync(() => {
          setCollapsed?.((prev: Set<number>) => {
            const next = new Set(prev);
            next.add(exIdx);
            return next;
          });
        });
        const firstSetOfNext = document.querySelector<HTMLElement>(`[data-set-first="${exIdx + 1}"]`);
        const nextCard = document.querySelector<HTMLElement>(`[data-exercise-idx="${exIdx + 1}"]`);
        const target = firstSetOfNext ?? nextCard;
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch { /* silenced */ }
    }, delay);
  };

  const handleComplete = () => {
    // Prevent double-tap from toggling done back to false
    if (completeBusyRef.current) return;
    completeBusyRef.current = true;
    setTimeout(() => { completeBusyRef.current = false; }, 400);

    const nowMs       = Date.now();
    const startedRaw  = (log as UnknownRecord)?.startedAtMs;
    const startedAtMs =
      typeof startedRaw === 'number'
        ? startedRaw
        : Number(String(startedRaw ?? '').trim());
    const executionSeconds =
      Number.isFinite(startedAtMs) && startedAtMs > 0
        ? Math.max(0, Math.round((nowMs - startedAtMs) / 1000))
        : 0;

    // ── Unilateral: two-phase completion ─────────────────────────────
    if (isUnilateral && !done) {
      if (activeSide === 'L') {
        // Complete L side → activate R
        updateLog(key, {
          L_done: true,
          L_reps: lRepsField.value || log.reps,
          activeSide: 'R',
          advanced_config: cfg ?? log.advanced_config ?? null,
        });
        if (sideRestTime > 0) {
          startTimer(sideRestTime, { kind: 'side_rest', key, restStartedAtMs: nowMs });
        }
        return;
      }
      // R side → complete the full set
      updateLog(key, {
        R_done: true,
        R_reps: rRepsField.value,
        done: true,
        completedAtMs: nowMs,
        executionSeconds,
        advanced_config: cfg ?? log.advanced_config ?? null,
      });
      if (restTime && restTime > 0) {
        const nextPlanned = getPlannedSet(ex, setIdx + 1);
        const nextKey = nextPlanned ? `${exIdx}-${setIdx + 1}` : null;
        startTimer(restTime, { kind: 'rest', key, nextKey, restStartedAtMs: nowMs });
      }
      if (setsCount != null && setIdx === setsCount - 1) {
        collapseAndScroll(restTime && restTime > 0 ? 600 : 300);
      }
      return;
    }

    // ── Unilateral toggle-back (already done → reset both sides) ─────
    if (isUnilateral && done) {
      updateLog(key, {
        done: false,
        L_done: false,
        R_done: false,
        activeSide: 'L',
        completedAtMs: null,
        executionSeconds: null,
        advanced_config: cfg ?? log.advanced_config ?? null,
      });
      return;
    }

    // ── Normal (non-unilateral) ───────────────────────────────────────
    const nextDone = !done;
    updateLog(key, {
      done: nextDone,
      completedAtMs:    nextDone ? nowMs : null,
      executionSeconds: nextDone ? executionSeconds : null,
      advanced_config:  cfg ?? log.advanced_config ?? null,
    });

    if (nextDone && restTime && restTime > 0) {
      const nextPlanned = getPlannedSet(ex, setIdx + 1);
      const nextKey     = nextPlanned ? `${exIdx}-${setIdx + 1}` : null;
      startTimer(restTime, { kind: 'rest', key, nextKey, restStartedAtMs: nowMs });
    }

    // Auto-collapse + scroll to FIRST SET of next exercise when last set is done.
    // flushSync forces React to apply the collapse before scrollIntoView so the
    // layout is stable and smooth scrolling lands on the correct exercise.
    if (nextDone && setsCount != null && setIdx === setsCount - 1) {
      collapseAndScroll(restTime && restTime > 0 ? 600 : 300);
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
            : isUnilateral && lDone
              ? 'bg-blue-950/20 border-blue-500/30'
              : 'bg-neutral-900/50 border-neutral-800/80',
        ].join(' ')}
      >
        {/* Unilateral side indicator */}
        {isUnilateral && !done && (
          <div className="flex items-center gap-2 mb-1.5">
            <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${
              activeSide === 'L'
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                : 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
            }`}>
              LADO {activeSide}
            </span>
            {lDone && (
              <span className="text-[9px] text-blue-400/70 font-bold">
                L ✓ {extLReps ? `${extLReps}r` : ''}
              </span>
            )}
          </div>
        )}

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

          {/* reps — side-aware when unilateral */}
          <div className="relative">
            {isUnilateral ? (
              activeSide === 'L' ? (
                <input
                  inputMode="decimal"
                  aria-label={`Reps lado L – série ${setIdx + 1}`}
                  value={lRepsField.value}
                  onChange={lRepsField.handleChange}
                  onFocus={lRepsField.handleFocus}
                  onBlur={lRepsField.handleBlur}
                  placeholder={repsPlaceholder}
                  className={inputBase}
                />
              ) : (
                <input
                  inputMode="decimal"
                  aria-label={`Reps lado R – série ${setIdx + 1}`}
                  value={rRepsField.value}
                  onChange={rRepsField.handleChange}
                  onFocus={rRepsField.handleFocus}
                  onBlur={rRepsField.handleBlur}
                  placeholder={repsPlaceholder}
                  className={inputBase}
                />
              )
            ) : (
              <>
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
              </>
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
                : isUnilateral && activeSide === 'R'
                  ? 'bg-blue-600 text-white border border-blue-500/50 shadow-sm shadow-blue-900/30'
                  : 'bg-neutral-800 border border-neutral-700 text-neutral-200 hover:bg-neutral-700 hover:border-yellow-500/40',
            ].join(' ')}
          >
            <Check size={13} />
            {done ? 'Feito' : isUnilateral ? `${activeSide} ✓` : 'OK'}
          </button>
        </div>
      </div>

      {/* Notes textarea */}
      {isNotesOpen && (
        <div className="px-1">
          <textarea
            id={notesId}
            aria-label={`Observações – série ${setIdx + 1}`}
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
