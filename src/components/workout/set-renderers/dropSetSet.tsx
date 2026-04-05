'use client';

import React from 'react';
import { parseTrainingNumber } from '@/utils/trainingNumber';
import { Check, MessageSquare, Pencil } from 'lucide-react';
import { useWorkoutContext } from '../WorkoutContext';
import { HelpHint } from '@/components/ui/HelpHint';
import { HELP_TERMS } from '@/utils/help/terms';
import {
  isObject,
} from '../utils';
import { UnknownRecord, WorkoutExercise } from '../types';

export const DropSetSet = ({ ex, exIdx, setIdx }: { ex: WorkoutExercise; exIdx: number; setIdx: number }) => {
  const {
    getLog,
    updateLog,
    getPlannedSet,
    setDropSetModal,
    openNotesKeys,
    toggleNotes,
  } = useWorkoutContext();

  const key = `${exIdx}-${setIdx}`;
  const log = getLog(key);
  const plannedSet = getPlannedSet(ex, setIdx);
  const cfgRaw = plannedSet?.advanced_config ?? plannedSet?.advancedConfig ?? null;
  const stagesPlannedRaw: unknown[] = Array.isArray(cfgRaw) ? cfgRaw : [];
  const ds = isObject(log.drop_set) ? (log.drop_set as UnknownRecord) : ({} as UnknownRecord);
  const stagesSavedRaw: unknown[] = Array.isArray(ds.stages) ? (ds.stages as unknown[]) : [];
  const stagesCount = Math.max(stagesPlannedRaw.length, stagesSavedRaw.length);

  // Se não houver estágios, não deveria renderizar DropSetSet, mas retornamos null ou NormalSet (se fosse decidido assim)
  // No código original, chamava renderNormalSet se !stagesCount.
  // Aqui assumimos que o pai decide, mas se vier vazio, renderizamos NormalSet (mas não posso importar NormalSet recursivamente se for circular).
  // Vou assumir que o pai verifica. Se passar aqui com 0, vai renderizar algo estranho ou vazio.
  if (!stagesCount) {
    // Parent controls routing to the proper renderer; return null as a safe fallback
    return null;
  }

  const auto = isObject(plannedSet?.it_auto) ? (plannedSet.it_auto as UnknownRecord) : null;
  const modeLabel = String(auto?.label || '').trim() || 'Drop';

  const stages: Array<{ weight: string; reps: number | null }> = Array.from({ length: stagesCount }).map((_, idx) => {
    const saved = isObject(stagesSavedRaw[idx]) ? (stagesSavedRaw[idx] as UnknownRecord) : null;
    const planned = isObject(stagesPlannedRaw[idx]) ? (stagesPlannedRaw[idx] as UnknownRecord) : null;
    const weight = String(saved?.weight ?? planned?.weight ?? '').trim();
    const reps = parseTrainingNumber(saved?.reps ?? planned?.reps) ?? null;
    return { weight, reps };
  });

  const total = stages.reduce<number>((acc, s) => acc + (typeof s.reps === 'number' ? s.reps : 0), 0);
  const done = !!log.done;
  const canDone = stages.every((s) => !!String(s.weight || '').trim() && (typeof s.reps === 'number' ? s.reps : 0) > 0);

  const notesValue = String(log.notes ?? '');
  const hasNotes = notesValue.trim().length > 0;
  const isNotesOpen = openNotesKeys.has(key);

  const handleToggleDone = () => {
    const nextDone = !done;
    const lastWeight = String(stages?.[stages.length - 1]?.weight || '').trim();
    const stageOut = stages.map((s) => ({
      weight: String(s?.weight ?? '').trim(),
      reps: parseTrainingNumber(s?.reps) ?? null,
    }));
    updateLog(key, {
      done: nextDone,
      weight: lastWeight,
      reps: String(total || ''),
      drop_set: { stages: stageOut },
    });
  };

  const summaryText = stages.map((s) => `${s.weight || '?'}kg×${s.reps ?? '?'}`).join(' → ');

  return (
    <div key={key} className="space-y-1">
      <div
        className={[
          'rounded-xl border px-2.5 py-2 transition-all duration-300 shadow-sm',
          done
            ? 'bg-emerald-950/30 border-emerald-500/30'
            : 'bg-neutral-900/50 border-neutral-800/80',
        ].join(' ')}
      >
        {done ? (
          /* ── Collapsed green row when done ── */
          <div className="flex items-center gap-2">
            <div className="w-10 text-xs font-mono text-neutral-400 shrink-0">#{setIdx + 1}</div>
            <span className="text-[10px] uppercase tracking-widest font-black text-emerald-400 shrink-0">{modeLabel || 'Drop'}</span>
            <span className="text-xs text-neutral-300 truncate flex-1 min-w-0">{summaryText}</span>
            <button
              type="button"
              onClick={() => toggleNotes(key)} aria-label="Observações"
              className={
                isNotesOpen || hasNotes
                  ? 'w-7 h-7 inline-flex items-center justify-center rounded-lg text-yellow-500 bg-yellow-500/10 border border-yellow-500/40 hover:bg-yellow-500/15 transition duration-200'
                  : 'w-7 h-7 inline-flex items-center justify-center rounded-lg text-neutral-500 bg-black/30 border border-neutral-700 hover:border-yellow-500/60 hover:text-yellow-500 transition duration-200'
              }
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
          /* ── Expanded row when not done ── */
          <div className="flex items-center gap-2">
            <div className="w-10 text-xs font-mono text-neutral-400">#{setIdx + 1}</div>
            <button
              type="button"
              onClick={() => {
                const baseStages = stages.map((s) => ({
                  weight: String(s?.weight ?? '').trim(),
                  reps: parseTrainingNumber(s?.reps) ?? null,
                }));
                setDropSetModal({ key, label: modeLabel, stages: baseStages, error: '' });
              }}
              className="w-24 bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none hover:border-yellow-500/60 hover:text-yellow-500 transition-colors inline-flex items-center justify-center gap-2"
            >
              <Pencil size={14} />
              <span className="text-xs font-black">Abrir</span>
            </button>
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-[10px] uppercase tracking-widest font-black text-yellow-500 inline-flex items-center gap-1 group">
                {modeLabel || 'Drop'}
                <HelpHint
                  title={(stagesCount >= 3 ? HELP_TERMS.dropSetDuplo : HELP_TERMS.dropSet).title}
                  text={(stagesCount >= 3 ? HELP_TERMS.dropSetDuplo : HELP_TERMS.dropSet).text}
                  tooltip={(stagesCount >= 3 ? HELP_TERMS.dropSetDuplo : HELP_TERMS.dropSet).tooltip}
                  className="h-4 w-4 text-[10px]"
                />
              </span>
              <span className="text-xs text-neutral-400 truncate">Etapas {stagesCount} • Total: {total || 0} reps</span>
            </div>
            <button
              type="button"
              onClick={() => toggleNotes(key)} aria-label="Observações"
              className={
                isNotesOpen || hasNotes
                  ? 'inline-flex items-center justify-center rounded-lg p-2 text-yellow-500 bg-yellow-500/10 border border-yellow-500/40 hover:bg-yellow-500/15 transition duration-200'
                  : 'inline-flex items-center justify-center rounded-lg p-2 text-neutral-400 bg-black/30 border border-neutral-700 hover:border-yellow-500/60 hover:text-yellow-500 transition duration-200'
              }
            >
              <MessageSquare size={14} />
            </button>
            <button
              type="button"
              disabled={!canDone}
              onClick={handleToggleDone}
              className={
                canDone
                  ? 'inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 font-black hover:bg-yellow-500/20 hover:border-yellow-500/50 transition-all'
                  : 'inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-800/40 border border-neutral-800 text-neutral-500 font-bold cursor-not-allowed'
              }
            >
              <Check size={16} />
              <span className="text-xs">Concluir</span>
            </button>
          </div>
        )}
      </div>

      {!done && !canDone && (
        <div className="pl-12 text-[11px] text-neutral-500 font-semibold">
          Preencha peso e reps em todas as etapas no modal para concluir.
        </div>
      )}

      {isNotesOpen && (
        <textarea
          value={notesValue}
          onChange={(e) => {
            const v = e?.target?.value ?? '';
            updateLog(key, { notes: v });
          }}
          placeholder="Observações da série"
          rows={2}
          aria-label="Observações da série"
          className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
        />
      )}
    </div>
  );
};
