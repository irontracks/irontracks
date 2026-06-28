'use client';

import React from 'react';
import { parseTrainingNumber } from '@/utils/trainingNumber';
import { Check, MessageSquare, Pencil } from 'lucide-react';
import { useWorkoutContext } from '../WorkoutContext';
import {
  isObject,
  normalizeExerciseKey,
} from '../utils';
import { UnknownRecord, WorkoutExercise } from '../types';

const WaveSetInner = ({ ex, exIdx, setIdx }: { ex: WorkoutExercise; exIdx: number; setIdx: number }) => {
  const { getLog, updateLog, setWaveModal, openNotesKeys, toggleNotes, startTimer, reportHistory } = useWorkoutContext();
  const key = `${exIdx}-${setIdx}`;
  const log = getLog(key);
  const waveData = isObject(log.wave) ? (log.wave as UnknownRecord) : null;
  const savedWeight = String(waveData?.weight ?? log.weight ?? '').trim();
  const wavesRaw: unknown[] = Array.isArray(waveData?.waves) ? (waveData.waves as unknown[]) : [];
  const wavesCount = wavesRaw.length || 2;
  const done = !!log.done;
  const canDone = !!savedWeight && wavesRaw.length > 0 && wavesRaw.every((w) => {
    const ww = isObject(w) ? (w as UnknownRecord) : null;
    return ww && parseTrainingNumber(ww.heavy) != null && parseTrainingNumber(ww.medium) != null && parseTrainingNumber(ww.ultra) != null;
  });
  const notesValue = String(log.notes ?? '');
  const hasNotes = notesValue.trim().length > 0;
  const isNotesOpen = openNotesKeys.has(key);
  const restTime = parseTrainingNumber(ex?.restTime ?? ex?.rest_time);
  const histEntry = reportHistory?.exercises?.[normalizeExerciseKey(ex.name)];
  const lastItem = histEntry?.items?.length ? [...histEntry.items].sort((a, b) => b.ts - a.ts)[0] : null;
  const prevNote = lastItem?.setNotes?.[setIdx] ?? null;
  const hasAnyNote = hasNotes || !!prevNote;
  const summaryText = `${savedWeight ? savedWeight + 'kg' : '—'} • ${wavesRaw.length} ondas`;

  const defaultWaves = Array.from({ length: wavesCount }).map((_, idx) => {
    const existing = isObject(wavesRaw[idx]) ? (wavesRaw[idx] as UnknownRecord) : null;
    return { heavy: parseTrainingNumber(existing?.heavy) ?? 3, medium: parseTrainingNumber(existing?.medium) ?? 5, ultra: parseTrainingNumber(existing?.ultra) ?? 2 };
  });

  const handleToggleDone = () => {
    const nextDone = !done;
    updateLog(key, { done: nextDone, weight: savedWeight, wave: waveData ?? {} });
    if (nextDone && restTime && restTime > 0) startTimer(restTime, { kind: 'rest', key, nextKey: null, restStartedAtMs: Date.now() });
  };

  return (
    <div key={key} className="space-y-1">
      <div
        className={[
          'rounded-xl border px-2.5 py-2 transition-all duration-300 shadow-sm',
          done ? 'bg-emerald-950/30 border-emerald-500/30' : 'bg-neutral-900/50 border-neutral-800/80',
        ].join(' ')}
      >
        {done ? (
          <div className="flex items-center gap-2">
            <div className="w-10 text-xs font-mono text-neutral-400 shrink-0">#{setIdx + 1}</div>
            <span className="text-[10px] uppercase tracking-widest font-black text-emerald-400 shrink-0">Onda</span>
            <span className="text-xs text-neutral-300 truncate flex-1 min-w-0">{summaryText}</span>
            <button
              type="button"
              onClick={() => toggleNotes(key)} aria-label="Observações"
              className={isNotesOpen || hasAnyNote ? 'h-9 w-9 inline-flex items-center justify-center rounded-lg text-yellow-500 bg-yellow-500/10 border border-yellow-500/40' : 'h-9 w-9 inline-flex items-center justify-center rounded-lg text-neutral-400 bg-black/30 border border-neutral-700 hover:border-yellow-500/60 hover:text-yellow-500 transition duration-200'}
            >
              <MessageSquare size={12} />
            </button>
            <button
              type="button"
              onClick={handleToggleDone}
              className="inline-flex items-center justify-center gap-1 h-9 px-3 rounded-xl font-black text-xs whitespace-nowrap active:scale-95 transition-all duration-150 bg-emerald-500 text-black shadow-sm shadow-emerald-500/30"
            >
              <Check size={13} />
              Feito
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div className="w-10 text-xs font-mono text-neutral-400">#{setIdx + 1}</div>
            <button
              type="button"
              onClick={() => setWaveModal({ key, weight: savedWeight, waves: defaultWaves, rpe: String(waveData?.rpe ?? log.rpe ?? ''), error: '' })}
              className="w-24 bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none hover:border-yellow-500/60 hover:text-yellow-500 transition-colors inline-flex items-center justify-center gap-2"
            >
              <Pencil size={14} />
              <span className="text-xs font-black">Abrir</span>
            </button>
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-[10px] uppercase tracking-widest font-black text-yellow-500">Onda</span>
              <span className="text-xs text-neutral-400 truncate">{canDone ? `${savedWeight}kg • ${wavesRaw.length} ondas` : 'Abra o modal para preencher'}</span>
            </div>
            <button type="button" onClick={() => toggleNotes(key)} aria-label="Observações" className={isNotesOpen || hasAnyNote ? 'inline-flex items-center justify-center rounded-lg p-2 text-yellow-500 bg-yellow-500/10 border border-yellow-500/40' : 'inline-flex items-center justify-center rounded-lg p-2 text-neutral-400 bg-black/30 border border-neutral-700 hover:border-yellow-500/60 hover:text-yellow-500 transition duration-200'}>
              <MessageSquare size={14} />
            </button>
            <button
              type="button"
              disabled={!canDone}
              onClick={handleToggleDone}
              className={canDone ? 'inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 font-black hover:bg-yellow-500/20 hover:border-yellow-500/50 transition-all' : 'inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-800/40 border border-neutral-800 text-neutral-400 font-bold cursor-not-allowed'}
            >
              <Check size={16} />
              <span className="text-xs">Concluir</span>
            </button>
          </div>
        )}
      </div>
      {!done && !canDone && <div className="pl-12 text-[11px] text-neutral-400 font-semibold">Preencha peso e ondas no modal para concluir.</div>}
      {isNotesOpen && (
        <div className="space-y-1.5">
          {prevNote && (
            <div className="flex items-start gap-1.5 px-2.5 py-1.5 rounded-lg bg-neutral-900/60 border border-neutral-800">
              <span className="text-[9px] font-black uppercase tracking-widest text-neutral-400 shrink-0 mt-0.5">Anterior</span>
              <p className="text-xs text-neutral-400 italic leading-snug">{prevNote}</p>
            </div>
          )}
          <textarea value={notesValue} onChange={(e) => updateLog(key, { notes: e?.target?.value ?? '' })} placeholder="Observações da série" rows={2} aria-label="Observações da série" className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-[16px] text-white outline-none focus:ring-1 ring-yellow-500" />
        </div>
      )}
    </div>
  );
};

export const WaveSet = React.memo(WaveSetInner, (a, b) =>
  a.ex === b.ex && a.exIdx === b.exIdx && a.setIdx === b.setIdx,
);
