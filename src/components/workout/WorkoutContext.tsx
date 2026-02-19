import { createContext, useContext } from 'react';
import { useActiveWorkoutController } from './useActiveWorkoutController';

type WorkoutContextType = ReturnType<typeof useActiveWorkoutController>;

const WorkoutContext = createContext<WorkoutContextType | null>(null);

export const useWorkoutContext = () => {
  const ctx = useContext(WorkoutContext);
  if (!ctx) throw new Error('useWorkoutContext must be used within WorkoutProvider');
  return ctx;
};

export const WorkoutProvider = WorkoutContext.Provider;
