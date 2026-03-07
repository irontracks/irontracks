import { createContext, useContext } from 'react';
import { useActiveWorkoutController } from './useActiveWorkoutController';

type ActiveWorkoutContextType = ReturnType<typeof useActiveWorkoutController>;

const ActiveWorkoutContext = createContext<ActiveWorkoutContextType | null>(null);

export const useActiveWorkout = () => {
  const ctx = useContext(ActiveWorkoutContext);
  if (!ctx) throw new Error('useActiveWorkout must be used within ActiveWorkoutProvider');
  return ctx;
};

export const ActiveWorkoutProvider = ActiveWorkoutContext.Provider;
