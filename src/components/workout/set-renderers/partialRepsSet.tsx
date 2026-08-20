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

const PartialRepsSetInner = ({ ex, exIdx, setIdx }: { ex: WorkoutExercise; exIdx: number; setIdx: number }) => {
  const { getLog, updateLog, setPartialRepsModal, startTimer, settings} = useWorkoutContext();
  const key = `${exIdx}-${setIdx}`;
  const log = getLog(key);
  const { isAutoWeight, rationale: autoRationale, plateHint: autoPlateHint } = useAutoloadWeight(ex, exIdx, setIdx);
  const pr = isObject(log.partial_reps) ? (log.partial_reps as UnknownRecord) : null;
  const savedWeight = String(pr?.weight ?? log.weight ?? '').trim();
  const fullReps = parseTrainingNumber(pr?.full_reps) ?? null;
  const partialCount = parseTrainingNumber(pr?.partial_count) ?? null;
  const done = !!log.done;
  const canDone = !!savedWeight && fullReps != null && fullReps > 0 && partialCount != null && partialCount > 0;
  const restTime = parseTrainingNumber(ex?.restTime ?? ex?.rest_time);
  const summaryText = `${savedWeight ? savedWeight + 'kg' : '—'} • ${fullReps ?? '?'} full + ${partialCount ?? '?'} parciais`;

  const handleToggleDone = () => {
    const nextDone = !done;
    updateLog(key, { done: nextDone, weight: savedWeight, reps: String((fullReps ?? 0) + (partialCount ?? 0)), partial_reps: pr ?? {} });
    if (nextDone && restTime && restTime > 0) startTimer(restTime, { kind: 'rest', key, nextKey: null, restStartedAtMs: Date.now() });
  };

  return (
    <AdvancedSetRow
      exIdx={exIdx}
      setIdx={setIdx}
      done={done}
      canDone={canDone}
      methodLabel="Parciais"
      info={canDone ? summaryText : 'Abra para preencher'}
      doneSummary={summaryText}
      hint={!canDone ? 'Preencha peso, reps completas e parciais no modal para concluir.' : ''}
      onOpen={() => setPartialRepsModal({ key, weight: savedWeight, full_reps: fullReps ?? '', partial_count: partialCount ?? '', rpe: String(pr?.rpe ?? log.rpe ?? ''), error: '' })}
      onToggleDone={handleToggleDone}
    >
      <AutoloadNote show={isAutoWeight} rationale={autoRationale} plateHint={autoPlateHint} className="pl-12" />
      {/* Anilhas do peso salvo no modal. Nestes métodos não há campo inline: o
          peso é digitado no modal e o card mostra o resumo — a dica acompanha o
          resumo, mesma informação do renderer normal. */}
      <PlateHintLine
        exerciseName={String(ex?.name ?? '')}
        weight={savedWeight}
        inventory={inventoryFromSettings(settings)}
        className="pl-12"
      />
    </AdvancedSetRow>
  );
};

export const PartialRepsSet = React.memo(PartialRepsSetInner, (a, b) =>
  a.ex === b.ex && a.exIdx === b.exIdx && a.setIdx === b.setIdx,
);
