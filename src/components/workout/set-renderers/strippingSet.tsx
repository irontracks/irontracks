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

const StrippingSetInner = ({ ex, exIdx, setIdx }: { ex: WorkoutExercise; exIdx: number; setIdx: number }) => {
  const { getLog, updateLog, getPlannedSet, setStrippingModal, startTimer, settings } = useWorkoutContext();
  const key = `${exIdx}-${setIdx}`;
  const log = getLog(key);
  const { isAutoWeight, rationale: autoRationale, plateHint: autoPlateHint } = useAutoloadWeight(ex, exIdx, setIdx);
  const plannedSet = getPlannedSet(ex, setIdx);
  const cfgRaw = plannedSet?.advanced_config ?? plannedSet?.advancedConfig ?? null;
  const stagesPlannedRaw: unknown[] = Array.isArray(cfgRaw) ? cfgRaw : [];
  const st = isObject(log.stripping) ? (log.stripping as UnknownRecord) : ({} as UnknownRecord);
  const stagesSavedRaw: unknown[] = Array.isArray(st.stages) ? (st.stages as unknown[]) : [];
  const defaultCount = Math.max(stagesPlannedRaw.length, stagesSavedRaw.length) || 3;

  const stages: Array<{ weight: string; reps: number | null }> = Array.from({ length: defaultCount }).map((_, idx) => {
    const saved = isObject(stagesSavedRaw[idx]) ? (stagesSavedRaw[idx] as UnknownRecord) : null;
    const planned = isObject(stagesPlannedRaw[idx]) ? (stagesPlannedRaw[idx] as UnknownRecord) : null;
    return {
      weight: String(saved?.weight ?? planned?.weight ?? '').trim(),
      reps: parseTrainingNumber(saved?.reps ?? planned?.reps) ?? null,
    };
  });

  const total = stages.reduce<number>((acc, s) => acc + (typeof s.reps === 'number' ? s.reps : 0), 0);
  const done = !!log.done;
  const canDone = stages.every((s) => !!String(s.weight || '').trim() && (typeof s.reps === 'number' ? s.reps : 0) > 0);
  const restTime = parseTrainingNumber(ex?.restTime ?? ex?.rest_time);

  const summaryText = stages.map((s) => `${s.weight || '?'}kg×${s.reps ?? '?'}`).join(' → ');

  const handleToggleDone = () => {
    const nextDone = !done;
    const firstWeight = String(stages[0]?.weight || '').trim();
    updateLog(key, { done: nextDone, weight: firstWeight, reps: String(total || ''), stripping: { stages } });
    if (nextDone && restTime && restTime > 0) startTimer(restTime, { kind: 'rest', key, nextKey: null, restStartedAtMs: Date.now() });
  };

  return (
    <AdvancedSetRow
      exIdx={exIdx}
      setIdx={setIdx}
      done={done}
      canDone={canDone}
      methodLabel="Stripping"
      info={`Etapas ${defaultCount} • Total: ${total || 0} reps`}
      doneSummary={summaryText}
      hint={!canDone ? 'Preencha peso e reps em todas as etapas no modal para concluir.' : ''}
      onOpen={() => setStrippingModal({ key, stages: stages.map((s) => ({ weight: s.weight, reps: s.reps ?? null })), error: '' })}
      onToggleDone={handleToggleDone}
    >
      <AutoloadNote show={isAutoWeight} rationale={autoRationale} plateHint={autoPlateHint} className="pl-12" />
      {/* Anilhas por lado do peso da primeira faixa — é a que se monta. */}
      <PlateHintLine
        exerciseName={String(ex?.name ?? '')}
        weight={String(stages[0]?.weight ?? log.weight ?? "").trim()}
        inventory={inventoryFromSettings(settings)}
        className="pl-12"
      />
    </AdvancedSetRow>
  );
};

export const StrippingSet = React.memo(StrippingSetInner, (a, b) =>
  a.ex === b.ex && a.exIdx === b.exIdx && a.setIdx === b.setIdx,
);
