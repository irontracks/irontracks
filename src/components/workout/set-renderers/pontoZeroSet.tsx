'use client';

import React from 'react';
import { Check, MessageSquare, Pencil } from 'lucide-react';
import { useWorkoutContext } from '../WorkoutContext';
import {
  isObject,
} from '../utils';
import { UnknownRecord, WorkoutExercise } from '../types';

export const PontoZeroSet = ({ ex, exIdx, setIdx }: { ex: WorkoutExercise; exIdx: number; setIdx: number }) => {
  const { getLog, updateLog, setPontoZeroModal, openNotesKeys, toggleNotes, startTimer } = useWorkoutContext();
  const key = `${exIdx}-${setIdx}`;
  const log = getLog(key);
  const pz = isObject(log.ponto_zero) ? (log.ponto_zero as UnknownRecord) : null;
  const savedWeight = String(pz?.weight ?? log.weight ?? '').trim();
  const reps = parseTrainingNumber(pz?.reps ?? log.reps) ?? null;
  const holdSec = parseTrainingNumber(pz?.hold_sec) ?? 4;
  const done = !!log.done;
  const canDone = !!savedWeight && reps != null && reps > 0;
  const notesValue = String(log.notes ?? '');
  const hasNotes = notesValue.trim().length > 0;
  const isNotesOpen = openNotesKeys.has(key);
  const restTime = parseTrainingNumber(ex?.restTime ?? ex?.rest_time);

  return (
    <div key={key} className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="w-10 text-xs font-mono text-neutral-400">#{setIdx + 1}</div>
        <button
          type="button"
          onClick={() => setPontoZeroModal({ key, weight: savedWeight, reps: reps ?? '', hold_sec: holdSec, rpe: String(pz?.rpe ?? log.rpe ?? ''), error: '' })}
          className="w-24 bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none hover:border-yellow-500/60 hover:text-yellow-500 transition-colors inline-flex items-center justify-center gap-2"
        >
          <Pencil size={14} />
          <span className="text-xs font-black">Abrir</span>
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-[10px] uppercase tracking-widest font-black text-yellow-500">Ponto Zero</span>
          <span className="text-xs text-neutral-400 truncate">{canDone ? `${savedWeight}kg • ${reps} reps • ${holdSec}s hold` : 'Abra o modal para preencher'}</span>
        </div>
        <button type="button" onClick={() => toggleNotes(key)} aria-label="Observações" className={isNotesOpen || hasNotes ? 'inline-flex items-center justify-center rounded-lg p-2 text-yellow-500 bg-yellow-500/10 border border-yellow-500/40' : 'inline-flex items-center justify-center rounded-lg p-2 text-neutral-400 bg-black/30 border border-neutral-700 hover:border-yellow-500/60 hover:text-yellow-500 transition duration-200'}>
          <MessageSquare size={14} />
        </button>
        <button
          type="button"
          disabled={!canDone}
          onClick={() => {
            const nextDone = !done;
            updateLog(key, { done: nextDone, weight: savedWeight, reps: String(reps || ''), ponto_zero: pz ?? {} });
            if (nextDone && restTime && restTime > 0) startTimer(restTime, { kind: 'rest', key, nextKey: null, restStartedAtMs: Date.now() });
          }}
          className={canDone ? done ? 'inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-yellow-500 text-black font-black' : 'inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 font-bold hover:bg-neutral-700' : 'inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-800/40 border border-neutral-800 text-neutral-500 font-bold cursor-not-allowed'}
        >
          <Check size={16} />
          <span className="text-xs">{done ? 'Feito' : 'Concluir'}</span>
        </button>
      </div>
      {!canDone && <div className="pl-12 text-[11px] text-neutral-500 font-semibold">Preencha peso e reps no modal para concluir.</div>}
      {isNotesOpen && <textarea value={notesValue} onChange={(e) => updateLog(key, { notes: e?.target?.value ?? '' })} placeholder="Observações da série" rows={2} className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500" />}
    </div>
  );
};
