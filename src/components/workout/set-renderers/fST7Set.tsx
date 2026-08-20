'use client';

import React from 'react';
import { parseTrainingNumber } from '@/utils/trainingNumber';
import { useWorkoutContext } from '../WorkoutContext';
import { AdvancedSetRow } from './AdvancedSetRow';
import { isObject } from '../utils';
import { UnknownRecord, WorkoutExercise } from '../types';
import { useAutoloadWeight } from '../hooks/useAutoloadWeight';
import { AutoloadNote } from './AutoloadNote';
import { PlateHintLine } from './PlateHintLine';
import { inventoryFromSettings } from '@/utils/plates/plateInventory';

const FST7SetInner = ({ ex, exIdx, setIdx }: { ex: WorkoutExercise; exIdx: number; setIdx: number }) => {
  const { getLog, updateLog, setFst7Modal, startTimer, settings } = useWorkoutContext();
  const key = `${exIdx}-${setIdx}`;
  const log = getLog(key);
  const { isAutoWeight, rationale: autoRationale, plateHint: autoPlateHint } = useAutoloadWeight(ex, exIdx, setIdx);
  const fst7Data = isObject(log.fst7) ? (log.fst7 as UnknownRecord) : null;
  const blocksRaw: unknown[] = Array.isArray(fst7Data?.blocks) ? (fst7Data.blocks as unknown[]) : [];
  const intraSec = parseTrainingNumber(fst7Data?.intra_sec) ?? 30;

  const blocks: Array<{ weight: string; reps: number | null }> = Array.from({ length: 7 }).map((_, idx) => {
    const b = isObject(blocksRaw[idx]) ? (blocksRaw[idx] as UnknownRecord) : null;
    return { weight: String(b?.weight ?? '').trim(), reps: parseTrainingNumber(b?.reps) ?? null };
  });

  const total = blocks.reduce<number>((acc, b) => acc + (typeof b.reps === 'number' ? b.reps : 0), 0);
  const done = !!log.done;
  const canDone = blocks.every((b) => !!String(b.weight || '').trim() && (typeof b.reps === 'number' ? b.reps : 0) > 0);
  const restTime = parseTrainingNumber(ex?.restTime ?? ex?.rest_time);

  const firstWeight = String(blocks[0]?.weight || '').trim();
  const summaryText = `${firstWeight ? firstWeight + 'kg' : '—'} • ${total || 0} reps total`;

  const handleToggleDone = () => {
    const nextDone = !done;
    updateLog(key, { done: nextDone, weight: firstWeight, reps: String(total || ''), fst7: { blocks, intra_sec: intraSec } });
    if (nextDone && restTime && restTime > 0) startTimer(restTime, { kind: 'rest', key, nextKey: null, restStartedAtMs: Date.now() });
  };

  return (
    <AdvancedSetRow
      exIdx={exIdx}
      setIdx={setIdx}
      done={done}
      canDone={canDone}
      methodLabel="FST-7"
      info={`7 blocos • ${intraSec}s intra • ${total || 0} reps total`}
      doneSummary={summaryText}
      hint={!canDone ? 'Preencha peso e reps dos 7 blocos no modal para concluir.' : ''}
      onOpen={() => setFst7Modal({ key, blocks: blocks.map((b) => ({ weight: b.weight, reps: b.reps ?? null })), intra_sec: intraSec, error: '' })}
      onToggleDone={handleToggleDone}
    >
      <AutoloadNote show={isAutoWeight} rationale={autoRationale} plateHint={autoPlateHint} className="pl-12" />
      {/* Anilhas por lado do peso do primeiro bloco — os 7 usam a mesma carga. */}
      <PlateHintLine
        exerciseName={String(ex?.name ?? '')}
        weight={firstWeight}
        inventory={inventoryFromSettings(settings)}
        className="pl-12"
      />
    </AdvancedSetRow>
  );
};

export const FST7Set = React.memo(FST7SetInner, (a, b) =>
  a.ex === b.ex && a.exIdx === b.exIdx && a.setIdx === b.setIdx,
);
