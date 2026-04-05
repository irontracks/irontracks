import { createContext, useContext } from 'react';
import { useActiveWorkoutController } from './useActiveWorkoutController';

export type WorkoutContextType = ReturnType<typeof useActiveWorkoutController> & {
  /** Injected by ActiveWorkout to trigger exit animation before navigating back */
  _exitOnBack?: () => void;
  /** Direct cancel — bypasses triggerExit animation to avoid being blocked by stale exitTimerRef */
  cancelWorkout?: () => void;
};

const WorkoutContext = createContext<WorkoutContextType | null>(null);

export const useWorkoutContext = () => {
  const ctx = useContext(WorkoutContext);
  if (!ctx) throw new Error('useWorkoutContext must be used within WorkoutProvider');
  return ctx;
};

export const WorkoutProvider = WorkoutContext.Provider;
