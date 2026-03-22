import type { UnknownRecord, WorkoutExercise, WorkoutSetDetail } from '../types';
import { isObject } from '../utils';
import { collectExerciseSetInputs } from '../helpers/setPlanningHelpers';
import { parseTrainingNumber } from '@/utils/trainingNumber';
import { applyExerciseOrder, buildExerciseDraft, draftOrderKeys } from '@/lib/workoutReorder';

const MAX_EXTRA_SETS_PER_EXERCISE = 50;
const MAX_EXTRA_EXERCISES_PER_WORKOUT = 50;
const DEFAULT_EXTRA_EXERCISE_REST_TIME_S = 60;

interface ExerciseCrudDeps {
  workout: UnknownRecord | null;
  exercises: WorkoutExercise[];
  logs: Record<string, unknown>;
  getLog: (key: string) => UnknownRecord;
  collapsed: Set<number>;
  setCollapsed: React.Dispatch<React.SetStateAction<Set<number>>>;
  linkedWeightExercises: Set<number>;
  setLinkedWeightExercises: React.Dispatch<React.SetStateAction<Set<number>>>;
  editExerciseDraft: { name: string; sets: string; restTime: string; method: string } | null;
  setEditExerciseDraft: (v: { name: string; sets: string; restTime: string; method: string }) => void;
  editExerciseIdx: number | null;
  setEditExerciseIdx: (v: number | null) => void;
  editExerciseOpen: boolean;
  setEditExerciseOpen: (v: boolean) => void;
  addExerciseDraft: { name: string; sets: string; restTime: string } | null;
  setAddExerciseDraft: (v: { name: string; sets: string; restTime: string }) => void;
  addExerciseOpen: boolean;
  setAddExerciseOpen: (v: boolean) => void;
  organizeDraft: UnknownRecord[];
  setOrganizeDraft: (v: UnknownRecord[]) => void;
  organizeSaving: boolean;
  setOrganizeSaving: (v: boolean) => void;
  organizeError: string;
  setOrganizeError: (v: string) => void;
  organizeOpen: boolean;
  setOrganizeOpen: (v: boolean) => void;
  organizeDirty: boolean;
  organizeBaseKeysRef: React.MutableRefObject<string>;
  onUpdateSession: ((update: Record<string, unknown>) => void) | undefined;
  alert: (msg: string, title?: string) => Promise<void>;
  confirm: (msg: string, title?: string, opts?: Record<string, unknown>) => Promise<boolean>;
}

export function useWorkoutExerciseCrud(deps: ExerciseCrudDeps) {
  const {
    workout, exercises, logs, getLog,
    collapsed, setCollapsed,
    linkedWeightExercises, setLinkedWeightExercises,
    editExerciseDraft, setEditExerciseDraft,
    editExerciseIdx, setEditExerciseIdx,
    editExerciseOpen, setEditExerciseOpen,
    addExerciseDraft, setAddExerciseDraft,
    addExerciseOpen, setAddExerciseOpen,
    organizeDraft, setOrganizeDraft,
    organizeSaving, setOrganizeSaving,
    organizeError, setOrganizeError,
    organizeOpen, setOrganizeOpen,
    organizeDirty, organizeBaseKeysRef,
    onUpdateSession,
    alert, confirm,
  } = deps;

  const toggleCollapse = (exIdx: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(exIdx)) next.delete(exIdx);
      else next.add(exIdx);
      return next;
    });
  };

  const toggleLinkWeights = (exIdx: number) => {
    setLinkedWeightExercises((prev) => {
      const next = new Set(prev);
      if (next.has(exIdx)) next.delete(exIdx);
      else next.add(exIdx);
      return next;
    });
  };

  const addExtraSetToExercise = async (exIdx: unknown) => {
    if (!workout || typeof onUpdateSession !== 'function') return;
    const idx = Number(exIdx);
    if (!Number.isFinite(idx) || idx < 0) return;
    if (idx >= exercises.length) return;
    try {
      const nextExercises = [...exercises];
      const exRaw = nextExercises[idx] && typeof nextExercises[idx] === 'object' ? nextExercises[idx] : {};
      const setsHeader = Math.max(0, Number.parseInt(String(exRaw?.sets ?? '0'), 10) || 0);
      const sdArrRaw = Array.isArray(exRaw?.setDetails) ? exRaw.setDetails : Array.isArray(exRaw?.set_details) ? exRaw.set_details : [];
      const sdArr = Array.isArray(sdArrRaw) ? [...sdArrRaw] : [];
      const setsCount = Math.max(setsHeader, sdArr.length);
      if (setsCount >= MAX_EXTRA_SETS_PER_EXERCISE) return;

      const last = sdArr.length > 0 ? sdArr[sdArr.length - 1] : null;
      const base = last && typeof last === 'object' ? last : {};
      const nextDetail = {
        ...base,
        set_number: setsCount + 1,
        weight: null,
        reps: '',
        rpe: null,
        notes: null,
        is_warmup: false,
      };

      sdArr.push(nextDetail);
      nextExercises[idx] = {
        ...exRaw,
        sets: setsCount + 1,
        setDetails: sdArr,
      };
      onUpdateSession({ workout: { ...workout, exercises: nextExercises } });
      setCollapsed((prev) => {
        const next = new Set(prev);
        if (next.has(idx)) next.delete(idx);
        return next;
      });
    } catch (e: unknown) {
      try {
        const msg = isObject(e) && typeof e.message === 'string' ? e.message : String(e || '');
        await alert('Não foi possível adicionar série extra: ' + msg);
      } catch { }
    }
  };

  const removeExtraSetFromExercise = async (exIdx: unknown) => {
    if (!workout || typeof onUpdateSession !== 'function') return;
    const idx = Number(exIdx);
    if (!Number.isFinite(idx) || idx < 0) return;
    if (idx >= exercises.length) return;
    try {
      const nextExercises = [...exercises];
      const exRaw = nextExercises[idx] && typeof nextExercises[idx] === 'object' ? nextExercises[idx] : {};
      const setsHeader = Math.max(0, Number.parseInt(String(exRaw?.sets ?? '0'), 10) || 0);
      const sdArrRaw = Array.isArray(exRaw?.setDetails) ? exRaw.setDetails : Array.isArray(exRaw?.set_details) ? exRaw.set_details : [];
      const sdArr = Array.isArray(sdArrRaw) ? [...sdArrRaw] : [];
      const setsCount = Math.max(setsHeader, sdArr.length);

      // Prevent deleting if there are only 0 or 1 sets left
      if (setsCount <= 1) return;

      sdArr.pop();
      nextExercises[idx] = {
        ...exRaw,
        sets: setsCount - 1,
        setDetails: sdArr,
      };

      const nextLogs: Record<string, unknown> = { ...(logs && typeof logs === 'object' ? logs : {}) };
      const discardedKey = `${idx}-${setsCount - 1}`;
      try {
        delete nextLogs[discardedKey];
      } catch { }

      onUpdateSession({ workout: { ...workout, exercises: nextExercises }, logs: nextLogs });
    } catch (e: unknown) {
      try {
        const msg = isObject(e) && typeof e.message === 'string' ? e.message : String(e || '');
        await alert('Não foi possível remover a série: ' + msg);
      } catch { }
    }
  };

  const openEditExercise = async (exIdx: unknown) => {
    if (!workout) return;
    const idx = Number(exIdx);
    if (!Number.isFinite(idx) || idx < 0) return;
    if (idx >= exercises.length) return;
    try {
      const ex = exercises[idx] && typeof exercises[idx] === 'object' ? exercises[idx] : ({} as WorkoutExercise);
      const name = String(ex?.name || '').trim() || `Exercício ${idx + 1}`;
      const setsHeader = Math.max(0, Number.parseInt(String(ex?.sets ?? '0'), 10) || 0);
      const sdArrRaw: unknown[] = Array.isArray(ex?.setDetails) ? (ex.setDetails as unknown[]) : Array.isArray(ex?.set_details) ? (ex.set_details as unknown[]) : [];
      const setsCount = Math.max(setsHeader, Array.isArray(sdArrRaw) ? sdArrRaw.length : 0) || 1;
      const restTimeNum = parseTrainingNumber(ex?.restTime ?? ex?.rest_time);
      const restTime = typeof restTimeNum === 'number' && Number.isFinite(restTimeNum) && restTimeNum > 0 ? restTimeNum : DEFAULT_EXTRA_EXERCISE_REST_TIME_S;
      const method = String(ex?.method || 'Normal').trim() || 'Normal';

      setEditExerciseDraft({ name, sets: String(setsCount), restTime: String(restTime), method });
      setEditExerciseIdx(idx);
      setEditExerciseOpen(true);
    } catch (e: unknown) {
      try {
        const msg = isObject(e) && typeof e.message === 'string' ? e.message : String(e || '');
        await alert('Não foi possível abrir a edição do exercício: ' + msg);
      } catch { }
    }
  };

  const saveEditExercise = async () => {
    if (!workout || typeof onUpdateSession !== 'function') return;
    const idx = typeof editExerciseIdx === 'number' ? editExerciseIdx : -1;
    if (idx < 0 || idx >= exercises.length) return;
    const name = String(editExerciseDraft?.name || '').trim();
    if (!name) {
      try {
        await alert('Informe o nome do exercício.', 'Editar exercício');
      } catch { }
      return;
    }
    const desiredSets = Math.max(1, Math.min(MAX_EXTRA_SETS_PER_EXERCISE, Number.parseInt(String(editExerciseDraft?.sets || '1'), 10) || 1));
    const restParsed = parseTrainingNumber(editExerciseDraft?.restTime);
    const restTime = typeof restParsed === 'number' && Number.isFinite(restParsed) && restParsed > 0 ? restParsed : null;
    const method = String(editExerciseDraft?.method || 'Normal').trim() || 'Normal';

    try {
      const nextExercises = [...exercises];
      const exRaw = nextExercises[idx] && typeof nextExercises[idx] === 'object' ? nextExercises[idx] : ({} as WorkoutExercise);
      const setsHeader = Math.max(0, Number.parseInt(String(exRaw?.sets ?? '0'), 10) || 0);
      const sdArrRaw: unknown[] = Array.isArray(exRaw?.setDetails) ? (exRaw.setDetails as unknown[]) : Array.isArray(exRaw?.set_details) ? (exRaw.set_details as unknown[]) : [];
      const sdArr = Array.isArray(sdArrRaw) ? [...sdArrRaw] : [];
      const previousSetsCount = Math.max(setsHeader, sdArr.length);

      const nextSetDetails: WorkoutSetDetail[] = [];
      for (let i = 0; i < desiredSets; i += 1) {
        const current = sdArr[i];
        const currentObj = current && typeof current === 'object' ? (current as UnknownRecord) : null;
        const setNumber = i + 1;
        if (currentObj) {
          const nextSetNumber = Number(currentObj.set_number ?? currentObj.setNumber ?? setNumber) || setNumber;
          nextSetDetails.push({ ...currentObj, set_number: nextSetNumber });
        } else {
          nextSetDetails.push({ set_number: setNumber, weight: null, reps: '', rpe: null, notes: null, is_warmup: false, advanced_config: null });
        }
      }

      nextExercises[idx] = {
        ...exRaw,
        name,
        method,
        sets: desiredSets,
        restTime,
        setDetails: nextSetDetails,
      };

      const nextLogs: Record<string, unknown> = { ...(logs && typeof logs === 'object' ? logs : {}) };
      if (previousSetsCount > desiredSets) {
        for (let i = desiredSets; i < previousSetsCount; i += 1) {
          try {
            delete nextLogs[`${idx}-${i}`];
          } catch { }
        }
      }

      onUpdateSession({ workout: { ...workout, exercises: nextExercises }, logs: nextLogs });
      setEditExerciseOpen(false);
      setEditExerciseIdx(null);
    } catch (e: unknown) {
      try {
        const msg = isObject(e) && typeof e.message === 'string' ? e.message : String(e || '');
        await alert('Não foi possível salvar a edição do exercício: ' + msg);
      } catch { }
    }
  };

  const addExtraExerciseToWorkout = async () => {
    if (!workout || typeof onUpdateSession !== 'function') return;
    if (exercises.length >= MAX_EXTRA_EXERCISES_PER_WORKOUT) return;
    const name = String(addExerciseDraft?.name || '').trim();
    if (!name) {
      try {
        await alert('Informe o nome do exercício.', 'Exercício extra');
      } catch { }
      return;
    }
    const sets = Math.max(1, Number.parseInt(String(addExerciseDraft?.sets || '3'), 10) || 1);
    const rest = parseTrainingNumber(addExerciseDraft?.restTime);
    const restTime = typeof rest === 'number' && Number.isFinite(rest) && rest > 0 ? rest : null;
    const nextExercise = {
      name,
      sets,
      restTime,
      method: 'Normal',
      setDetails: [] as unknown[],
    };
    try {
      onUpdateSession({ workout: { ...workout, exercises: [...exercises, nextExercise] } });
      setAddExerciseOpen(false);
      setAddExerciseDraft({ name: '', sets: String(sets), restTime: String(restTime ?? DEFAULT_EXTRA_EXERCISE_REST_TIME_S) });
    } catch (e: unknown) {
      try {
        const msg = isObject(e) && typeof e.message === 'string' ? e.message : String(e || '');
        await alert('Não foi possível adicionar exercício extra: ' + msg);
      } catch { }
    }
  };

  const openOrganizeModal = () => {
    const draft = buildExerciseDraft(exercises);
    const safeDraft: UnknownRecord[] = Array.isArray(draft) ? (draft as UnknownRecord[]) : [];
    setOrganizeDraft(safeDraft);
    organizeBaseKeysRef.current = Array.isArray(draftOrderKeys(safeDraft)) ? (draftOrderKeys(safeDraft) as string[]).join(',') : String(draftOrderKeys(safeDraft));
    setOrganizeError('');
    setOrganizeOpen(true);
  };

  const requestCloseOrganize = async () => {
    if (organizeSaving) return;
    if (organizeDirty) {
      let ok = false;
      try {
        ok = typeof confirm === 'function' ? await confirm('Existem mudanças não salvas. Deseja sair?', 'Sair sem salvar?', { confirmText: 'Sair', cancelText: 'Continuar' }) : false;
      } catch {
        ok = false;
      }
      if (!ok) return;
    }
    setOrganizeOpen(false);
  };

  const saveOrganize = async () => {
    if (!workout || organizeSaving) return;
    const workoutId = String(workout?.id ?? workout?.workout_id ?? '').trim();
    if (!workoutId) {
      setOrganizeError('Não foi possível salvar: treino sem ID.');
      return;
    }
    setOrganizeSaving(true);
    setOrganizeError('');
    try {
      const orderedExercises = applyExerciseOrder(exercises, organizeDraft);
      const payload = { ...workout, exercises: orderedExercises };
      const response = await fetch('/api/workouts/update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: workoutId, workout: payload }),
      }).catch((): null => null);
      const result = response ? await response.json().catch((): null => null) : null;
      if (!response || !response.ok || !result?.ok) {
        setOrganizeError(String(result?.error || 'Falha ao salvar a ordem.'));
        setOrganizeSaving(false);
        return;
      }
      if (typeof onUpdateSession === 'function') {
        onUpdateSession({ workout: { ...workout, exercises: orderedExercises } });
      }
      organizeBaseKeysRef.current = Array.isArray(draftOrderKeys(organizeDraft)) ? (draftOrderKeys(organizeDraft) as string[]).join(',') : String(draftOrderKeys(organizeDraft));
      setOrganizeOpen(false);
      try {
        await alert('Ordem dos exercícios salva com sucesso.');
      } catch { }
    } catch (e: unknown) {
      const msg = isObject(e) && typeof e.message === 'string' ? e.message : String(e || 'Falha ao salvar a ordem.');
      setOrganizeError(msg);
    } finally {
      setOrganizeSaving(false);
    }
  };


  /** Directly rename an exercise by index — used by AI swap. */
  const swapExerciseName = (exIdx: number, newName: string) => {
    if (!workout || typeof onUpdateSession !== 'function') return;
    if (exIdx < 0 || exIdx >= exercises.length) return;
    const trimmed = newName.trim();
    if (!trimmed) return;
    try {
      const nextExercises = [...exercises];
      const exRaw = nextExercises[exIdx] && typeof nextExercises[exIdx] === 'object' ? nextExercises[exIdx] : {} as WorkoutExercise;
      nextExercises[exIdx] = { ...exRaw, name: trimmed };
      onUpdateSession({ workout: { ...workout, exercises: nextExercises } });
    } catch { /* silent */ }
  };

  return {
    toggleCollapse,
    toggleLinkWeights,
    addExtraSetToExercise,
    removeExtraSetFromExercise,
    openEditExercise,
    saveEditExercise,
    addExtraExerciseToWorkout,
    swapExerciseName,
    openOrganizeModal,
    requestCloseOrganize,
    saveOrganize,
  };
}
