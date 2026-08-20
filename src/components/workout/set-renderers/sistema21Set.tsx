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

const Sistema21SetInner = ({ ex, exIdx, setIdx }: { ex: WorkoutExercise; exIdx: number; setIdx: number }) => {
  const { getLog, updateLog, setSistema21Modal, startTimer, settings} = useWorkoutContext();
  const key = `${exIdx}-${setIdx}`;
  const log = getLog(key);
  const { isAutoWeight, rationale: autoRationale, plateHint: autoPlateHint } = useAutoloadWeight(ex, exIdx, setIdx);
  const s21 = isObject(log.sistema21) ? (log.sistema21 as UnknownRecord) : null;
  const savedWeight = String(s21?.weight ?? log.weight ?? '').trim();
  const phase1 = parseTrainingNumber(s21?.phase1) ?? null;
  const phase2 = parseTrainingNumber(s21?.phase2) ?? null;
  const phase3 = parseTrainingNumber(s21?.phase3) ?? null;
  const done = !!log.done;
  const canDone = !!savedWeight && phase1 != null && phase1 > 0 && phase2 != null && phase2 > 0 && phase3 != null && phase3 > 0;
  const total = (phase1 ?? 0) + (phase2 ?? 0) + (phase3 ?? 0);
  const restTime = parseTrainingNumber(ex?.restTime ?? ex?.rest_time);
  const summaryText = `${savedWeight ? savedWeight + 'kg' : '—'} • P1:${phase1 ?? '?'}+P2:${phase2 ?? '?'}+P3:${phase3 ?? '?'} = ${total} reps`;

  const handleToggleDone = () => {
    const nextDone = !done;
    updateLog(key, { done: nextDone, weight: savedWeight, reps: String(total), sistema21: s21 ?? {} });
    if (nextDone && restTime && restTime > 0) startTimer(restTime, { kind: 'rest', key, nextKey: null, restStartedAtMs: Date.now() });
  };

  return (
    <AdvancedSetRow
      exIdx={exIdx}
      setIdx={setIdx}
      done={done}
      canDone={canDone}
      methodLabel="Sistema 21"
      info={canDone ? summaryText : 'Abra para preencher'}
      doneSummary={summaryText}
      hint={!canDone ? 'Preencha peso e as 3 fases no modal para concluir.' : ''}
      onOpen={() => setSistema21Modal({ key, weight: savedWeight, phase1: phase1 ?? 7, phase2: phase2 ?? 7, phase3: phase3 ?? 7, rpe: String(s21?.rpe ?? log.rpe ?? ''), error: '' })}
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

export const Sistema21Set = React.memo(Sistema21SetInner, (a, b) =>
  a.ex === b.ex && a.exIdx === b.exIdx && a.setIdx === b.setIdx,
);
