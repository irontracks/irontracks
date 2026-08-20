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

const HeavyDutySetInner = ({ ex, exIdx, setIdx }: { ex: WorkoutExercise; exIdx: number; setIdx: number }) => {
  const { getLog, updateLog, setHeavyDutyModal, startTimer, settings} = useWorkoutContext();
  const key = `${exIdx}-${setIdx}`;
  const log = getLog(key);
  const { isAutoWeight, rationale: autoRationale, plateHint: autoPlateHint } = useAutoloadWeight(ex, exIdx, setIdx);
  const hd = isObject(log.heavy_duty) ? (log.heavy_duty as UnknownRecord) : null;
  const savedWeight = String(hd?.weight ?? log.weight ?? '').trim();
  // CONTAGEM de reps até falhar — não confundir com a flag `log.failure`, que é o
  // toggle manual e trava a progressão do autoload. Heavy Duty vai à falha em toda
  // série; gravar a flag aqui congelaria a carga pra sempre. Ver o comentário em
  // utils/autoload/suggestWeight.ts (decisão de produto, travada por teste).
  const repsFailure = parseTrainingNumber(hd?.reps_failure ?? log.reps) ?? null;
  const forcedCount = parseTrainingNumber(hd?.forced_count) ?? null;
  const negativesCount = parseTrainingNumber(hd?.negatives_count) ?? null;
  const done = !!log.done;
  const canDone = !!savedWeight && repsFailure != null && repsFailure > 0;
  const restTime = parseTrainingNumber(ex?.restTime ?? ex?.rest_time);

  const summary = canDone
    ? `${savedWeight}kg • ${repsFailure} falha${forcedCount ? ` + ${forcedCount} forçadas` : ''}${negativesCount ? ` + ${negativesCount} neg` : ''}`
    : 'Abra o modal para preencher';

  const handleToggleDone = () => {
    const nextDone = !done;
    updateLog(key, { done: nextDone, weight: savedWeight, reps: String(repsFailure || ''), heavy_duty: hd ?? {} });
    if (nextDone && restTime && restTime > 0) startTimer(restTime, { kind: 'rest', key, nextKey: null, restStartedAtMs: Date.now() });
  };

  return (
    <AdvancedSetRow
      exIdx={exIdx}
      setIdx={setIdx}
      done={done}
      canDone={canDone}
      methodLabel="Heavy Duty"
      info={summary}
      doneSummary={summary}
      hint={!canDone ? 'Preencha peso e reps até a falha no modal para concluir.' : ''}
      onOpen={() => setHeavyDutyModal({ key, weight: savedWeight, reps_failure: repsFailure ?? '', forced_count: forcedCount ?? '', negatives_count: negativesCount ?? '', eccentric_sec: parseTrainingNumber(hd?.eccentric_sec) ?? '', rpe: String(hd?.rpe ?? log.rpe ?? ''), error: '' })}
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

export const HeavyDutySet = React.memo(HeavyDutySetInner, (a, b) =>
  a.ex === b.ex && a.exIdx === b.exIdx && a.setIdx === b.setIdx,
);
