import { createContext, useContext } from 'react';
import { useActiveWorkoutController } from './useActiveWorkoutController';

// O controller agora retorna { value, logs }. O value é o context principal (estável
// entre teclas); `logs` (mapa cru que muda a cada tecla) vai num context separado.
export type WorkoutContextType = ReturnType<typeof useActiveWorkoutController>['value'] & {
  /** Injected by ActiveWorkout to trigger exit animation before navigating back */
  _exitOnBack?: () => void;
  /** Direct cancel — bypasses triggerExit animation to avoid being blocked by stale exitTimerRef */
  cancelWorkout?: () => void;
};

export type WorkoutLogs = ReturnType<typeof useActiveWorkoutController>['logs'];

const WorkoutContext = createContext<WorkoutContextType | null>(null);

export const useWorkoutContext = () => {
  const ctx = useContext(WorkoutContext);
  if (!ctx) throw new Error('useWorkoutContext must be used within WorkoutProvider');
  return ctx;
};

export const WorkoutProvider = WorkoutContext.Provider;

// ── Logs em context separado ────────────────────────────────────────────────
// Só ExerciseList/ExerciseCard consomem — assim uma tecla no peso/reps re-renderiza
// apenas eles, não os ~48 consumers do context principal.
const WorkoutLogsContext = createContext<WorkoutLogs>({} as WorkoutLogs);

export const useWorkoutLogs = () => useContext(WorkoutLogsContext);

export const WorkoutLogsProvider = WorkoutLogsContext.Provider;
