'use client';

import React, { useState } from 'react';
import { parseTrainingNumber } from '@/utils/trainingNumber';
import { Check, ChevronDown, MessageSquare, Pencil } from 'lucide-react';
import { useWorkoutContext } from '../WorkoutContext';
import {
  isObject,
  toNumber,
  normalizeExerciseKey,
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

const PER_SET_METHODS = ['Normal', 'Drop-Set', 'SST', 'Rest-Pause', 'Cluster', 'Stripping', 'Bi-Set', 'Super-Set'];

export const GroupMethodSet = ({ ex, exIdx, setIdx }: { ex: WorkoutExercise; exIdx: number; setIdx: number }) => {
  const { getLog, updateLog, setGroupMethodModal, openNotesKeys, toggleNotes, startTimer, getPlanConfig, reportHistory } = useWorkoutContext();
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const key = `${exIdx}-${setIdx}`;
  const log = getLog(key);
  const cfg = getPlanConfig(ex, setIdx);
  const method = String(ex?.method || '').trim();
  const perSetMethod = String(log.per_set_method || '').trim();
  const effectiveMethod = perSetMethod || method;
  const prevNote = (() => {
    const entry = reportHistory?.exercises?.[normalizeExerciseKey(ex.name)];
    const latest = entry?.items?.length ? [...entry.items].sort((a, b) => b.ts - a.ts)[0] : null;
    return latest?.setNotes?.[setIdx] ?? null;
  })();
  const weightValue = String(log.weight ?? (isObject(cfg) ? toNumber((cfg as UnknownRecord).weight) ?? '' : '') ?? '');
  const repsValue = String(log.reps ?? '');
  const rpeValue = String(log.rpe ?? '');
  const done = !!log.done;
  const canDone = !!String(weightValue || '').trim() && !!String(repsValue || '').trim() && parseTrainingNumber(repsValue) != null && parseTrainingNumber(repsValue)! > 0;
  const notesValue = String(log.notes ?? '');
  const hasNotes = notesValue.trim().length > 0;
  const isNotesOpen = openNotesKeys.has(key);
  const hasAnyNote = hasNotes || !!prevNote;
  const restTime = parseTrainingNumber(ex?.restTime ?? ex?.rest_time);
  const plannedSet = ex?.sets ? (Array.isArray(ex.sets) ? ex.sets[setIdx] : null) : null;
  const plannedReps = String(isObject(plannedSet) ? (plannedSet as UnknownRecord).reps ?? '' : ex?.reps ?? '').trim();

  const plannedWeight = parseTrainingNumber(isObject(plannedSet) ? (plannedSet as UnknownRecord).weight ?? ex?.weight ?? null : ex?.weight ?? null);

  const histEntry = reportHistory?.exercises?.[normalizeExerciseKey(ex.name)];
  const lastItem = histEntry?.items?.length
    ? [...histEntry.items].sort((a, b) => b.ts - a.ts)[0]
    : null;
  const histWeight = lastItem?.setWeights?.[setIdx] ?? null;
  const histReps   = lastItem?.setReps?.[setIdx]   ?? null;
  const histRpe    = lastItem?.setRpes?.[setIdx]   ?? null;

  return (
    <div key={key} className="rounded-xl bg-neutral-900/50 border border-neutral-800/80 px-3 py-2.5 space-y-2 shadow-sm shadow-black/20">
      {/* Row 1: número + inputs */}
      <div className="flex items-center gap-2">
        <div className="w-8 text-xs font-mono text-neutral-400 shrink-0">#{setIdx + 1}</div>
        <input
          type="number"
          inputMode="decimal"
          aria-label={`Peso em kg – série ${setIdx + 1}`}
          value={weightValue}
          onChange={(e) => updateLog(key, { weight: e?.target?.value ?? '' })}
          placeholder={histWeight != null ? `${histWeight} kg` : plannedWeight != null ? `${plannedWeight} kg` : 'Peso (kg)'}
          className="flex-1 min-w-0 bg-black/30 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white placeholder:text-neutral-400 outline-none focus:ring-1 ring-yellow-500"
        />
        <input
          type="number"
          inputMode="numeric"
          aria-label={`Reps – série ${setIdx + 1}`}
          value={repsValue}
          onChange={(e) => updateLog(key, { reps: e?.target?.value ?? '' })}
          placeholder={plannedReps || (histReps != null ? String(histReps) : 'Reps')}
          className="w-20 shrink-0 bg-black/30 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white placeholder:text-neutral-400 outline-none focus:ring-1 ring-yellow-500"
        />
        <input
          type="number"
          inputMode="decimal"
          aria-label={`RPE – série ${setIdx + 1}`}
          value={rpeValue}
          onChange={(e) => updateLog(key, { rpe: e?.target?.value ?? '' })}
          placeholder={histRpe != null ? String(histRpe) : 'RPE'}
          className="w-16 shrink-0 bg-black/30 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white placeholder:text-yellow-400/50 outline-none focus:ring-1 ring-yellow-500"
        />
      </div>
      {/* Row 2: badge método + botões de ação */}
      <div className="flex items-center gap-1.5 pl-10">
        <button
          type="button"
          onClick={() => setIsPickerOpen(p => !p)}
          className="inline-flex items-center gap-0.5 text-[10px] uppercase tracking-widest font-black text-yellow-500 hover:text-yellow-400 flex-1 truncate transition-colors"
        >
          {effectiveMethod}
          <ChevronDown size={10} className={`transition-transform ${isPickerOpen ? 'rotate-180' : ''}`} />
        </button>
        <button
          type="button"
          onClick={() => toggleNotes(key)} aria-label="Observações"
          className={isNotesOpen || hasAnyNote ? 'shrink-0 inline-flex items-center justify-center rounded-lg p-1.5 text-yellow-500 bg-yellow-500/10 border border-yellow-500/40' : 'shrink-0 inline-flex items-center justify-center rounded-lg p-1.5 text-neutral-400 bg-black/30 border border-neutral-700 hover:border-yellow-500/60 hover:text-yellow-500 transition duration-200'}
        >
          <MessageSquare size={12} />
        </button>
        <button
          type="button"
          title={GROUP_METHOD_INFO[effectiveMethod] ?? effectiveMethod}
          onClick={() => setGroupMethodModal({ key, method: effectiveMethod, weight: weightValue, reps: repsValue, rpe: rpeValue, info: GROUP_METHOD_INFO[effectiveMethod] ?? '', error: '' })}
          className="shrink-0 inline-flex items-center justify-center rounded-lg p-1.5 text-neutral-400 bg-black/30 border border-neutral-700 hover:border-yellow-500/60 hover:text-yellow-500 transition duration-200"
        >
          <Pencil size={12} />
        </button>
        <button
          type="button"
          disabled={!canDone}
          onClick={() => {
            const nextDone = !done;
            updateLog(key, { done: nextDone, weight: weightValue, reps: repsValue, rpe: rpeValue });
            if (nextDone && restTime && restTime > 0) startTimer(restTime, { kind: 'rest', key, nextKey: null, restStartedAtMs: Date.now() });
          }}
          className={canDone ? done ? 'inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500 text-black font-black shadow-sm shadow-emerald-500/30' : 'inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 font-black hover:bg-yellow-500/20 hover:border-yellow-500/50 transition-all' : 'inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-800/40 border border-neutral-800 text-neutral-500 font-bold cursor-not-allowed'}
        >
          <Check size={16} />
          <span className="text-xs">{done ? 'Feito' : 'Concluir'}</span>
        </button>
      </div>
      {isPickerOpen && (
        <div className="flex flex-wrap gap-1 pl-10 pb-1">
          {PER_SET_METHODS.map(opt => (
            <button
              key={opt}
              type="button"
              onClick={() => { updateLog(key, { per_set_method: opt }); setIsPickerOpen(false); }}
              className={`px-2 py-0.5 rounded-md text-[10px] font-black border transition-colors ${effectiveMethod === opt ? 'bg-yellow-500/20 border-yellow-500/40 text-yellow-400' : 'bg-neutral-900 border-neutral-700 text-neutral-400 hover:border-neutral-600 hover:text-neutral-300'}`}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
      {isNotesOpen && (
        <div className="space-y-1.5">
          {prevNote && (
            <div className="flex items-start gap-1.5 px-2.5 py-1.5 rounded-lg bg-neutral-900/60 border border-neutral-800">
              <span className="text-[9px] font-black uppercase tracking-widest text-neutral-600 shrink-0 mt-0.5">Anterior</span>
              <p className="text-xs text-neutral-500 italic leading-snug">{prevNote}</p>
            </div>
          )}
          <textarea
            aria-label="Observações da série"
            value={notesValue}
            onChange={(e) => updateLog(key, { notes: e?.target?.value ?? '' })}
            placeholder="Observações da série"
            rows={2}
            className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
          />
        </div>
      )}
    </div>
  );
};
