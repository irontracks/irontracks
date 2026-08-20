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

const PontoZeroSetInner = ({ ex, exIdx, setIdx }: { ex: WorkoutExercise; exIdx: number; setIdx: number }) => {
  const { getLog, updateLog, setPontoZeroModal, startTimer, settings } = useWorkoutContext();
  const key = `${exIdx}-${setIdx}`;
  const log = getLog(key);
  const { isAutoWeight, rationale: autoRationale, plateHint: autoPlateHint } = useAutoloadWeight(ex, exIdx, setIdx);
  const pz = isObject(log.ponto_zero) ? (log.ponto_zero as UnknownRecord) : null;
  const savedWeight = String(pz?.weight ?? log.weight ?? '').trim();
  const reps = parseTrainingNumber(pz?.reps ?? log.reps) ?? null;
  const holdSec = parseTrainingNumber(pz?.hold_sec) ?? 4;
  const done = !!log.done;
  const canDone = !!savedWeight && reps != null && reps > 0;
  const restTime = parseTrainingNumber(ex?.restTime ?? ex?.rest_time);
  const summaryText = `${savedWeight ? savedWeight + 'kg' : '—'} • ${reps ?? '?'} reps • ${holdSec}s hold`;

  const handleToggleDone = () => {
    const nextDone = !done;
    updateLog(key, { done: nextDone, weight: savedWeight, reps: String(reps || ''), ponto_zero: pz ?? {} });
    if (nextDone && restTime && restTime > 0) startTimer(restTime, { kind: 'rest', key, nextKey: null, restStartedAtMs: Date.now() });
  };

  return (
    <AdvancedSetRow
      exIdx={exIdx}
      setIdx={setIdx}
      done={done}
      canDone={canDone}
      methodLabel="Ponto Zero"
      info={canDone ? summaryText : 'Abra para preencher'}
      doneSummary={summaryText}
      hint={!canDone ? 'Preencha peso e reps no modal para concluir.' : ''}
      onOpen={() =>
        setPontoZeroModal({
          key,
          weight: savedWeight,
          reps: reps ?? '',
          hold_sec: holdSec,
          rpe: String(pz?.rpe ?? log.rpe ?? ''),
          error: '',
        })
      }
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

export const PontoZeroSet = React.memo(PontoZeroSetInner, (a, b) =>
  a.ex === b.ex && a.exIdx === b.exIdx && a.setIdx === b.setIdx,
);
