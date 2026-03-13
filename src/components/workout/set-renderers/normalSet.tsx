'use client';

import React from 'react';
import { parseTrainingNumber } from '@/utils/trainingNumber';
import { Check, MessageSquare } from 'lucide-react';
import { useWorkoutContext } from '../WorkoutContext';
import { HelpHint } from '@/components/ui/HelpHint';
import { HELP_TERMS } from '@/utils/help/terms';
import {
  isObject,
  DELOAD_SUGGEST_MODE,
} from '../utils';
import { UnknownRecord, WorkoutExercise } from '../types';

export const NormalSet = ({ ex, exIdx, setIdx, setsCount }: { ex: WorkoutExercise; exIdx: number; setIdx: number; setsCount?: number }) => {
  const {
    getLog,
    updateLog,
    getPlanConfig,
    getPlannedSet,
    startTimer,
    openNotesKeys,
    toggleNotes,
    deloadSuggestions,
    collapsed,
    setCollapsed,
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
  const weightPlaceholder = useWatermark && suggestion?.weight != null ? `${suggestion.weight}` : 'kg';
  const repsPlaceholder = useWatermark && suggestion?.reps != null ? String(suggestion.reps) : 'Reps';
  const rpePlaceholder = useWatermark && suggestion?.rpe != null ? String(suggestion.rpe) : 'RPE';

  const notesId = `notes-${key}`;
  const hasNotes = notesValue.trim().length > 0;
  const isNotesOpen = openNotesKeys.has(key);

  // Shared compact input class
  const inputBase =
    'w-full bg-black/40 border border-neutral-700/80 rounded-xl px-2 py-2 text-sm text-white text-center outline-none focus:ring-1 ring-yellow-500 focus:border-yellow-500/50 transition-all duration-200 placeholder:text-neutral-600 placeholder:opacity-70 focus:placeholder:opacity-0';

  // Badge color
  const badgeColors = ['bg-yellow-500 text-black', 'bg-orange-500 text-black', 'bg-amber-500 text-black', 'bg-yellow-400 text-black'];
  const badgeColor = done ? 'bg-emerald-500 text-black' : badgeColors[setIdx % badgeColors.length];

  const handleComplete = () => {
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

    // Auto-collapse this exercise + scroll to next when ALL sets are done
    if (nextDone && setsCount != null && setIdx === setsCount - 1) {
      try {
        // Small delay so the timer overlay appears first
        setTimeout(() => {
          try {
            // Collapse this exercise card
            setCollapsed?.((prev: Set<number>) => {
              const next = new Set(prev);
              next.add(exIdx);
              return next;
            });
            // Scroll to the next exercise card
            const nextCard = document.querySelector<HTMLElement>(`[data-exercise-idx="${exIdx + 1}"]`);
            if (nextCard) {
              nextCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          } catch { /* silenced */ }
        }, restTime && restTime > 0 ? 600 : 300);
      } catch { /* silenced */ }
    }
  };

  return (
    <div className="space-y-1" key={key}>
      {/* Single-line row: badge | kg | reps | rpe | notes | OK */}
      <div
        className={[
          'rounded-xl border px-2 py-2 transition-all duration-300 shadow-sm',
          done
            ? 'bg-emerald-950/30 border-emerald-500/30 shadow-emerald-900/20'
            : 'bg-neutral-900/50 border-neutral-800/80 shadow-black/20',
        ].join(' ')}
      >
        <div className="flex items-center gap-1.5">
          {/* Set number badge */}
          <div
            className={[
              'flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center font-black text-[11px] transition-all duration-300',
              badgeColor,
            ].join(' ')}
          >
            {done ? <Check size={12} /> : setIdx + 1}
          </div>

          {/* kg input */}
          <div className="flex-[2] min-w-0">
            <input
              inputMode="decimal"
              aria-label={`Peso em kg para série ${setIdx + 1}`}
              value={weightValue}
              onChange={(e) => {
                const v = e?.target?.value ?? '';
                updateLog(key, { weight: v, advanced_config: cfg ?? log.advanced_config ?? null });
              }}
              placeholder={weightPlaceholder}
              className={inputBase}
            />
          </div>

          {/* reps input */}
          <div className="flex-[1.5] min-w-0 relative">
            <input
              inputMode="decimal"
              aria-label={`Repetições para série ${setIdx + 1}`}
              value={repsValue}
              onChange={(e) => {
                const v = e?.target?.value ?? '';
                updateLog(key, { reps: v, advanced_config: cfg ?? log.advanced_config ?? null });
              }}
              placeholder={repsPlaceholder}
              className={`${inputBase} ${plannedReps ? 'pr-7' : ''}`}
            />
            {plannedReps ? (
              <div className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] font-mono text-neutral-500/70">
                {plannedReps}
              </div>
            ) : null}
          </div>

          {/* RPE input */}
          <div className="flex-[1.2] min-w-0 relative">
            <input
              inputMode="decimal"
              aria-label={`RPE percebido para série ${setIdx + 1}`}
              value={rpeValue}
              onChange={(e) => {
                const v = e?.target?.value ?? '';
                updateLog(key, { rpe: v, advanced_config: cfg ?? log.advanced_config ?? null });
              }}
              placeholder={rpePlaceholder}
              className={`${inputBase} text-yellow-400 border-yellow-500/30 placeholder:text-yellow-500/50 ${plannedRpe ? 'pr-7' : ''}`}
            />
            {plannedRpe ? (
              <div className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] font-mono text-yellow-500/45">
                {plannedRpe}
              </div>
            ) : null}
          </div>

          {/* Notes toggle */}
          <button
            type="button"
            aria-label={isNotesOpen ? 'Fechar observações' : 'Abrir observações da série'}
            onClick={() => toggleNotes(key)}
            className={
              isNotesOpen || hasNotes
                ? 'flex-shrink-0 inline-flex items-center justify-center rounded-lg w-7 h-7 text-yellow-500 bg-yellow-500/10 border border-yellow-500/40 hover:bg-yellow-500/15 transition duration-200'
                : 'flex-shrink-0 inline-flex items-center justify-center rounded-lg w-7 h-7 text-neutral-500 bg-black/30 border border-neutral-700 hover:border-yellow-500/60 hover:text-yellow-500 transition duration-200'
            }
          >
            <MessageSquare size={12} />
          </button>

          {/* OK / Concluído button */}
          <button
            type="button"
            onClick={handleComplete}
            className={[
              'flex-shrink-0 inline-flex items-center justify-center gap-1 h-8 px-3 rounded-xl font-black text-xs active:scale-95 transition-all duration-150',
              done
                ? 'bg-emerald-500 text-black shadow-sm shadow-emerald-500/30'
                : 'bg-neutral-800 border border-neutral-700 text-neutral-200 hover:bg-neutral-700 hover:border-yellow-500/40',
            ].join(' ')}
          >
            <Check size={13} />
            <span className="whitespace-nowrap">{done ? 'Feito' : 'OK'}</span>
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
