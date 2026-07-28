import { createContext, useContext } from 'react';
import { useActiveWorkoutController } from './useActiveWorkoutController';

// O controller agora retorna { value, logs }. O value é o context principal (estável
// entre teclas); `logs` (mapa cru que muda a cada tecla) vai num context separado.
export type WorkoutContextType = ReturnType<typeof useActiveWorkoutController>['value'] & {
  /** Injected by ActiveWorkout to trigger exit animation before navigating back */
  _exitOnBack?: () => void;
  /** Direct cancel — bypasses triggerExit animation to avoid being blocked by stale exitTimerRef */
  cancelWorkout?: () => void;
  /**
   * Abre o painel de cardio com GPS. Ele só nasce no topo do treino quando é
   * relevante (corrida em andamento/recuperada ou cardio outdoor no treino);
   * nos demais casos chega por aqui — botão no card de cardio e menu do header.
   */
  openCardioGps?: () => void;
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
// null como default (não `{}`) pra falhar ALTO se algum componente futuro consumir fora
// do provider — igual ao useWorkoutContext. Um mapa vazio legítimo (sem séries ainda)
// chega como `{}` DO provider, distinto do null de "sem provider".
const WorkoutLogsContext = createContext<WorkoutLogs | null>(null);

export const useWorkoutLogs = (): WorkoutLogs => {
  const ctx = useContext(WorkoutLogsContext);
  if (ctx === null) throw new Error('useWorkoutLogs must be used within WorkoutLogsProvider');
  return ctx;
};

export const WorkoutLogsProvider = WorkoutLogsContext.Provider;
