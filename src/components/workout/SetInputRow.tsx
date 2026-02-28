import React from 'react';
import { MessageSquare, Check } from 'lucide-react';
import { HelpHint } from '@/components/ui/HelpHint';
import { useActiveWorkout } from './ActiveWorkoutContext';
import { isObject, toNumber } from './utils';
import { UnknownRecord } from './types';

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
  const useWatermark = true; // DELOAD_SUGGEST_MODE assumed 'watermark'
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
            aria-label={isNotesOpen ? 'Fechar observações' : 'Abrir observações da série'}
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
            aria-label={`Peso em kg para série ${setIdx + 1}`}
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
              aria-label={`Repetições para série ${setIdx + 1}`}
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
              aria-label={`RPE percebido para série ${setIdx + 1}`}
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
