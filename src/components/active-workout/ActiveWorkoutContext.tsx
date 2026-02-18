import { createContext, useContext } from 'react';
import { UnknownRecord } from './types';

type ActiveWorkoutContextType = {
  getLog: (key: string) => UnknownRecord;
  updateLog: (key: string, data: UnknownRecord) => void;
  getPlanConfig: (ex: unknown, setIdx: number) => UnknownRecord | null;
  getPlannedSet: (ex: unknown, setIdx: number) => UnknownRecord | null;
  deloadSuggestions: Record<string, unknown>;
  openNotesKeys: Set<string>;
  toggleNotes: (key: string) => void;
  startTimer: (seconds: number, meta?: unknown) => void;
  setRestPauseModal: (data: unknown) => void;
  setClusterModal: (data: unknown) => void;
  setDropSetModal: (data: unknown) => void;
  HELP_TERMS: Record<string, { title: string; text: string; tooltip: string }>;
};

const ActiveWorkoutContext = createContext<ActiveWorkoutContextType | null>(null);

export const useActiveWorkout = () => {
  const ctx = useContext(ActiveWorkoutContext);
  if (!ctx) throw new Error('useActiveWorkout must be used within ActiveWorkoutProvider');
  return ctx;
};

export const ActiveWorkoutProvider = ActiveWorkoutContext.Provider;
