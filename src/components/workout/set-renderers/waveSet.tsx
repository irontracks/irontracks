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

const WaveSetInner = ({ ex, exIdx, setIdx }: { ex: WorkoutExercise; exIdx: number; setIdx: number }) => {
  const { getLog, updateLog, setWaveModal, startTimer, settings} = useWorkoutContext();
  const key = `${exIdx}-${setIdx}`;
  const log = getLog(key);
  const { isAutoWeight, rationale: autoRationale, plateHint: autoPlateHint } = useAutoloadWeight(ex, exIdx, setIdx);
  const waveData = isObject(log.wave) ? (log.wave as UnknownRecord) : null;
  const savedWeight = String(waveData?.weight ?? log.weight ?? '').trim();
  const wavesRaw: unknown[] = Array.isArray(waveData?.waves) ? (waveData.waves as unknown[]) : [];
  const wavesCount = wavesRaw.length || 2;
  const done = !!log.done;
  const canDone = !!savedWeight && wavesRaw.length > 0 && wavesRaw.every((w) => {
    const ww = isObject(w) ? (w as UnknownRecord) : null;
    return ww && parseTrainingNumber(ww.heavy) != null && parseTrainingNumber(ww.medium) != null && parseTrainingNumber(ww.ultra) != null;
  });
  const restTime = parseTrainingNumber(ex?.restTime ?? ex?.rest_time);
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
    <AdvancedSetRow
      exIdx={exIdx}
      setIdx={setIdx}
      done={done}
      canDone={canDone}
      methodLabel="Onda"
      info={canDone ? summaryText : 'Abra para preencher'}
      doneSummary={summaryText}
      hint={!canDone ? 'Preencha peso e reps das ondas no modal para concluir.' : ''}
      onOpen={() => setWaveModal({ key, weight: savedWeight, heavyWeight: String(waveData?.heavyWeight ?? savedWeight ?? ''), mediumWeight: String(waveData?.mediumWeight ?? ''), ultraWeight: String(waveData?.ultraWeight ?? ''), waves: defaultWaves, rpe: String(waveData?.rpe ?? log.rpe ?? ''), error: '' })}
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

export const WaveSet = React.memo(WaveSetInner, (a, b) =>
  a.ex === b.ex && a.exIdx === b.exIdx && a.setIdx === b.setIdx,
);
