import React from 'react';
import { useActiveWorkout } from '../ActiveWorkoutContext';
import { isObject, isClusterConfig, isRestPauseConfig } from '../utils';
import { UnknownRecord } from '../types';
import { NormalSet } from './NormalSet';

type Props = {
  ex: UnknownRecord;
  exIdx: number;
  setIdx: number;
};

export const ExerciseSet: React.FC<Props> = ({ ex, exIdx, setIdx }) => {
  const { getLog, getPlanConfig, getPlannedSet } = useActiveWorkout();
  const key = `${exIdx}-${setIdx}`;
  const log = getLog(key);
  const plannedSet = getPlannedSet(ex, setIdx);
  const rawCfg = plannedSet?.advanced_config ?? plannedSet?.advancedConfig ?? null;
  const dropSet = isObject(log.drop_set) ? (log.drop_set as UnknownRecord) : null;
  const dropStages: unknown[] = dropSet && Array.isArray(dropSet.stages) ? (dropSet.stages as unknown[]) : [];
  const hasDropStages = dropStages.length > 0;

  if (Array.isArray(rawCfg) || hasDropStages) {
    // TODO: Implement DropSetSet
    return <NormalSet ex={ex} exIdx={exIdx} setIdx={setIdx} />;
  }

  const cfg = getPlanConfig(ex, setIdx);
  const method = String(ex?.method || '').trim();
  const isCluster = method === 'Cluster' || isClusterConfig(cfg);
  const isRestPause = method === 'Rest-Pause' || isRestPauseConfig(cfg);

  if (isCluster) {
    // TODO: Implement ClusterSet
    return <NormalSet ex={ex} exIdx={exIdx} setIdx={setIdx} />;
  }
  if (isRestPause) {
    // TODO: Implement RestPauseSet
    return <NormalSet ex={ex} exIdx={exIdx} setIdx={setIdx} />;
  }

  return <NormalSet ex={ex} exIdx={exIdx} setIdx={setIdx} />;
};
