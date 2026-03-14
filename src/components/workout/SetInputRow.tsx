import React, { useRef, useEffect } from 'react';
import { MessageSquare, Check } from 'lucide-react';
import { motion, useAnimationControls } from 'framer-motion';
import { HelpHint } from '@/components/ui/HelpHint';
import { HELP_TERMS } from '@/utils/help/terms';
import { useActiveWorkout } from './ActiveWorkoutContext';
import { isObject, toNumber } from './utils';
import { UnknownRecord } from './types';
import { triggerHaptic } from '@/utils/native/irontracksNative';

type Props = {
  ex: UnknownRecord;
  exIdx: number;
  setIdx: number;
};

export const SetInputRow: React.FC<Props> = ({ ex, exIdx, setIdx }) => {
  const {
    getLog,
    updateLog,
    getPlanConfig,
    getPlannedSet,
    deloadSuggestions,
    openNotesKeys,
    toggleNotes,
    startTimer,
    HELP_TERMS,
  } = useActiveWorkout();

  const key = `${exIdx}-${setIdx}`;
  const log = getLog(key);
  const cfg = getPlanConfig(ex, setIdx);
  const plannedSet = getPlannedSet(ex, setIdx);
  const restTime = toNumber(ex?.restTime ?? ex?.rest_time);
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
  const useWatermark = true;
  const weightPlaceholder = useWatermark && suggestion?.weight != null ? `${suggestion.weight} kg` : 'Peso (kg)';
  const repsPlaceholder = useWatermark && suggestion?.reps != null ? String(suggestion.reps) : 'Reps';
  const rpePlaceholder = useWatermark && suggestion?.rpe != null ? String(suggestion.rpe) : 'RPE';

  const isHeaderRow = setIdx === 0;
  const notesId = `notes-${key}`;
  const hasNotes = notesValue.trim().length > 0;
  const isNotesOpen = openNotesKeys.has(key);

  // Badge color cycles through the set number for visual variety
  const badgeColors = [
    'bg-yellow-500 text-black',
    'bg-orange-500 text-black',
    'bg-amber-500 text-black',
    'bg-yellow-400 text-black',
  ];
  const badgeColor = done
    ? 'bg-emerald-500 text-black'
    : badgeColors[setIdx % badgeColors.length];

  // Badge slam animation controller
  const badgeControls = useAnimationControls();
  const buttonControls = useAnimationControls();
  const prevDoneRef = useRef(done);
  const rowFlashRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (done && !prevDoneRef.current) {
      // Just completed — trigger slam!
      badgeControls.start({
        scale: [1, 1.4, 0.9, 1.1, 1],
        rotate: [0, -10, 8, -3, 0],
        transition: { duration: 0.5, ease: 'easeOut' },
      });
      buttonControls.start({
        scale: [1, 1.15, 1],
        transition: { duration: 0.3, ease: 'easeOut' },
      });
      // Flash the row
      if (rowFlashRef.current) {
        rowFlashRef.current.style.boxShadow = 'inset 0 0 30px rgba(16,185,129,0.3), 0 0 20px rgba(16,185,129,0.15)';
        setTimeout(() => {
          if (rowFlashRef.current) rowFlashRef.current.style.boxShadow = '';
        }, 600);
      }
    }
    prevDoneRef.current = done;
  }, [done, badgeControls, buttonControls]);

  // Shared input base class — unified palette (no RPE-specific color in idle state)
  const inputBase =
    'w-full bg-black/40 border border-neutral-700/80 rounded-xl px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500 focus:border-yellow-500/50 transition-all duration-200 placeholder:text-neutral-600 placeholder:opacity-60 focus:placeholder:opacity-0 input-premium-focus';

  return (
    <div className="space-y-1.5" key={key}>
      {isHeaderRow && (
        <div className="hidden sm:flex items-center gap-2 text-[10px] uppercase tracking-widest text-neutral-500 font-bold px-1">
          <div className="w-8" />
          <div className="flex-1 min-w-0">Peso (kg)</div>
          <div className="flex-1 min-w-0">Reps</div>
          <div className="flex-1 min-w-0 inline-flex items-center gap-1">
            RPE
            <HelpHint title={HELP_TERMS.rpe.title} text={HELP_TERMS.rpe.text} tooltip={HELP_TERMS.rpe.tooltip} className="h-4 w-4 text-[10px]" />
          </div>
          <div className="w-28 text-right">Ações</div>
        </div>
      )}

      {/* Main row — full-width single line on mobile */}
      <div
        ref={rowFlashRef}
        className={[
          'rounded-xl border px-3 py-2.5 transition-all duration-300 shadow-sm',
          done
            ? 'bg-emerald-950/30 border-emerald-500/30 shadow-emerald-900/20'
            : 'bg-neutral-900/50 border-neutral-800/80 shadow-black/20',
        ].join(' ')}
        style={{ transition: 'box-shadow 0.6s ease-out, background-color 0.3s, border-color 0.3s' }}
      >
        {/* Row: badge | inputs | concluir | notes toggle */}
        <div className="flex items-center gap-2">
          {/* Set number badge — circular, premium, with slam animation */}
          <motion.div
            animate={badgeControls}
            className={[
              'flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center font-black text-[11px] transition-all duration-300',
              badgeColor,
            ].join(' ')}
          >
            {done ? <Check size={12} /> : setIdx + 1}
          </motion.div>

          {/* Inputs — 3-col on all sizes, compact */}
          <div className="flex-1 grid grid-cols-3 gap-1.5 min-w-0">
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
            <div className="relative">
              <input
                inputMode="decimal"
                aria-label={`Repetições para série ${setIdx + 1}`}
                value={repsValue}
                onChange={(e) => {
                  const v = e?.target?.value ?? '';
                  updateLog(key, { reps: v, advanced_config: cfg ?? log.advanced_config ?? null });
                }}
                placeholder={repsPlaceholder}
                className={`${inputBase} ${plannedReps ? 'pr-8' : ''}`}
              />
              {plannedReps ? (
                <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-mono text-neutral-500/70">
                  {plannedReps}
                </div>
              ) : null}
            </div>
            <div className="relative">
              <input
                inputMode="decimal"
                aria-label={`RPE percebido para série ${setIdx + 1}`}
                value={rpeValue}
                onChange={(e) => {
                  const v = e?.target?.value ?? '';
                  updateLog(key, { rpe: v, advanced_config: cfg ?? log.advanced_config ?? null });
                }}
                placeholder={rpePlaceholder}
                className={`${inputBase} ${plannedRpe ? 'pr-8' : ''}`}
              />
              {plannedRpe ? (
                <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-mono text-neutral-500/70">
                  {plannedRpe}
                </div>
              ) : null}
            </div>
          </div>

          {/* Notes toggle */}
          <button
            type="button"
            aria-label={isNotesOpen ? 'Fechar observações' : 'Abrir observações da série'}
            onClick={() => toggleNotes(key)}
            className={
              isNotesOpen || hasNotes
                ? 'flex-shrink-0 inline-flex items-center justify-center rounded-lg w-8 h-8 text-yellow-500 bg-yellow-500/10 border border-yellow-500/40 hover:bg-yellow-500/15 transition duration-200'
                : 'flex-shrink-0 inline-flex items-center justify-center rounded-lg w-8 h-8 text-neutral-500 bg-black/30 border border-neutral-700 hover:border-yellow-500/60 hover:text-yellow-500 transition duration-200'
            }
          >
            <MessageSquare size={13} />
          </button>

          {/* Concluir button — full label, premium feel with slam */}
          <motion.button
            type="button"
            animate={buttonControls}
            onClick={() => {
              const nextDone = !done;
              const now = Date.now();
              const timingPatch: Record<string, unknown> = {};
              if (nextDone) {
                const rawStartMs = log.setStartMs;
                const startMs = typeof rawStartMs === 'number' && rawStartMs > 0 ? rawStartMs : null;
                if (startMs) {
                  const execSec = Math.round((now - startMs) / 1000);
                  if (execSec > 0 && execSec < 86400) {
                    timingPatch.executionSeconds = execSec;
                  }
                }
                if (restTime && restTime > 0) {
                  timingPatch.restStartMs = now;
                }
                // Haptic feedback on completion
                try { triggerHaptic('success'); } catch { }
              } else {
                timingPatch.executionSeconds = null;
                timingPatch.restStartMs = null;
                timingPatch.setStartMs = now;
              }
              updateLog(key, { done: nextDone, ...timingPatch, advanced_config: cfg ?? log.advanced_config ?? null });
              if (nextDone && restTime && restTime > 0) {
                startTimer(restTime, { kind: 'rest', key, exerciseName: String(ex?.name || '').trim() });
              }
            }}
            className={[
              'flex-shrink-0 inline-flex items-center justify-center gap-1.5 min-h-[36px] px-3 rounded-xl font-black text-xs active:scale-95 transition-all duration-150',
              done
                ? 'bg-emerald-500 text-black shadow-md shadow-emerald-500/40'
                : 'bg-neutral-800 border border-neutral-700 text-neutral-200 hover:bg-neutral-700 hover:border-yellow-500/40',
            ].join(' ')}
          >
            <Check size={14} />
            <span className="whitespace-nowrap">{done ? 'Feito' : 'OK'}</span>
          </motion.button>
        </div>
      </div>

      {/* Notes area */}
      {isNotesOpen && (
        <div className="px-1">
          <textarea
            id={notesId}
            aria-label={`Observações da série ${setIdx + 1}`}
            value={notesValue}
            onChange={(e) => {
              const v = e?.target?.value ?? '';
              updateLog(key, { notes: v, advanced_config: cfg ?? log.advanced_config ?? null });
            }}
            placeholder="Observações da série (opcional)"
            rows={2}
            className="w-full bg-black/30 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500 border-yellow-500/20 shadow-sm shadow-yellow-500/5 transition duration-200"
          />
        </div>
      )}
    </div>
  );
};
