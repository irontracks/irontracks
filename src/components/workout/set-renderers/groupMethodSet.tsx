'use client';

import React from 'react';
import { Check, MessageSquare, Pencil } from 'lucide-react';
import { useWorkoutContext } from '../WorkoutContext';
import {
  isObject,
  toNumber,
} from '../utils';
import { UnknownRecord, WorkoutExercise } from '../types';

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
          onClick={() => toggleNotes(key)} aria-label="Observações"
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
