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

const ForcedRepsSetInner = ({ ex, exIdx, setIdx }: { ex: WorkoutExercise; exIdx: number; setIdx: number }) => {
  const { getLog, updateLog, setForcedRepsModal, startTimer, settings} = useWorkoutContext();
  const key = `${exIdx}-${setIdx}`;
  const log = getLog(key);
  const { isAutoWeight, rationale: autoRationale, plateHint: autoPlateHint } = useAutoloadWeight(ex, exIdx, setIdx);
  const fr = isObject(log.forced_reps) ? (log.forced_reps as UnknownRecord) : null;
  const savedWeight = String(fr?.weight ?? log.weight ?? '').trim();
  // CONTAGEM de reps até falhar — não confundir com a flag `log.failure`, que é o
  // toggle manual e trava a progressão do autoload. Repetições Forçadas vão à falha
  // em toda série; gravar a flag aqui congelaria a carga pra sempre. Ver o comentário
  // em utils/autoload/suggestWeight.ts (decisão de produto, travada por teste).
  const repsFailure = parseTrainingNumber(fr?.reps_failure ?? log.reps) ?? null;
  const forcedCount = parseTrainingNumber(fr?.forced_count) ?? null;
  const done = !!log.done;
  const canDone = !!savedWeight && repsFailure != null && repsFailure > 0 && forcedCount != null && forcedCount > 0;
  const restTime = parseTrainingNumber(ex?.restTime ?? ex?.rest_time);
  const summaryText = `${savedWeight ? savedWeight + 'kg' : '—'} • ${repsFailure ?? '?'} falha + ${forcedCount ?? '?'} forçadas`;

  const handleToggleDone = () => {
    const nextDone = !done;
    updateLog(key, { done: nextDone, weight: savedWeight, reps: String(repsFailure || ''), forced_reps: fr ?? {} });
    if (nextDone && restTime && restTime > 0) startTimer(restTime, { kind: 'rest', key, nextKey: null, restStartedAtMs: Date.now() });
  };

  return (
    <AdvancedSetRow
      exIdx={exIdx}
      setIdx={setIdx}
      done={done}
      canDone={canDone}
      methodLabel="Forçadas"
      info={canDone ? summaryText : 'Abra para preencher'}
      doneSummary={summaryText}
      hint={!canDone ? 'Preencha peso, reps e forçadas no modal para concluir.' : ''}
      onOpen={() => setForcedRepsModal({ key, weight: savedWeight, reps_failure: repsFailure ?? '', forced_count: forcedCount ?? '', rpe: String(fr?.rpe ?? log.rpe ?? ''), error: '' })}
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

export const ForcedRepsSet = React.memo(ForcedRepsSetInner, (a, b) =>
  a.ex === b.ex && a.exIdx === b.exIdx && a.setIdx === b.setIdx,
);
