import { useState } from 'react';

import type { UnknownRecord, WorkoutExercise, WorkoutSetDetail } from '../types';
import { isObject } from '../utils';

import { parseTrainingNumber } from '@/utils/trainingNumber';
import { editedSetDetails, stripMethodBlobs } from '../helpers/editedSetDetails';
import { applyExerciseOrder, buildExerciseDraft, draftOrderKeys } from '@/lib/workoutReorder';
import {
  tagExercisesForEdit,
  reconcileEditedExercises,
  remapIndexSet,
  remapCurrentIndex,
} from '../helpers/reconcileEditedExercises';

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
  editExerciseDraft: { name: string; sets: string; restTime: string; method: string; isUnilateral?: boolean; sideRestTime?: string | null; transitionTime?: string | null } | null;
  setEditExerciseDraft: (v: { name: string; sets: string; restTime: string; method: string; isUnilateral?: boolean; sideRestTime?: string | null; transitionTime?: string | null }) => void;
  setEditExerciseOriginal: (v: { name: string; sets: string; restTime: string; method: string; isUnilateral?: boolean; sideRestTime?: string | null; transitionTime?: string | null } | null) => void;
  persistToPlan: boolean;
  setPersistToPlan: (v: boolean) => void;
  editExerciseHasChanges: boolean;
  onPersistWorkoutTemplate?: ((workout: UnknownRecord) => void) | undefined;
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
  organizeBaseKeysRef: React.MutableRefObject<string[]>;
  currentExerciseIdx: number;
  setCurrentExerciseIdx: (v: number) => void;
  deleteConfirmIdx: number | null;
  setDeleteConfirmIdx: (v: number | null) => void;
  onUpdateSession: ((update: Record<string, unknown>) => void) | undefined;
  alert: (msg: string, title?: string) => Promise<void>;
  confirm: (msg: string, title?: string, opts?: Record<string, unknown>) => Promise<boolean>;
}

export function useWorkoutExerciseCrud(deps: ExerciseCrudDeps) {
  const {
    workout, exercises, logs,
    setCollapsed,
    setLinkedWeightExercises,
    editExerciseDraft, setEditExerciseDraft,
    setEditExerciseOriginal,
    persistToPlan, setPersistToPlan,
    editExerciseHasChanges,
    onPersistWorkoutTemplate,
    editExerciseIdx, setEditExerciseIdx,
    setEditExerciseOpen,
    addExerciseDraft, setAddExerciseDraft,
    setAddExerciseOpen,
    organizeDraft, setOrganizeDraft,
    organizeSaving, setOrganizeSaving,
    setOrganizeError,
    setOrganizeOpen,
    organizeDirty, organizeBaseKeysRef,
    currentExerciseIdx, setCurrentExerciseIdx,
    deleteConfirmIdx, setDeleteConfirmIdx,
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
      const isUnilateral = !!(ex?.isUnilateral ?? (ex as Record<string, unknown>)?.is_unilateral);
      const sideRestTimeNum = parseTrainingNumber((ex as Record<string, unknown>)?.sideRestTime ?? (ex as Record<string, unknown>)?.side_rest_time);
      const sideRestTime = typeof sideRestTimeNum === 'number' && sideRestTimeNum > 0 ? String(sideRestTimeNum) : '';
      const transitionTimeNum = parseTrainingNumber((ex as Record<string, unknown>)?.transitionTime ?? (ex as Record<string, unknown>)?.transition_time);
      const transitionTime = typeof transitionTimeNum === 'number' && transitionTimeNum > 0 ? String(transitionTimeNum) : '';

      const snapshot = { name, sets: String(setsCount), restTime: String(restTime), method, isUnilateral, sideRestTime, transitionTime };
      setEditExerciseDraft(snapshot);
      setEditExerciseOriginal(snapshot);
      setPersistToPlan(false);
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
    const isUnilateral = !!(editExerciseDraft as Record<string, unknown>)?.isUnilateral;
    const sideRestParsed = parseTrainingNumber((editExerciseDraft as Record<string, unknown>)?.sideRestTime);
    const sideRestTime = typeof sideRestParsed === 'number' && sideRestParsed > 0 ? sideRestParsed : null;
    const transitionParsed = parseTrainingNumber((editExerciseDraft as Record<string, unknown>)?.transitionTime);
    const transitionTime = typeof transitionParsed === 'number' && transitionParsed > 0 ? transitionParsed : null;

    try {
      const nextExercises = [...exercises];
      const exRaw = nextExercises[idx] && typeof nextExercises[idx] === 'object' ? nextExercises[idx] : ({} as WorkoutExercise);
      const setsHeader = Math.max(0, Number.parseInt(String(exRaw?.sets ?? '0'), 10) || 0);
      const sdArrRaw: unknown[] = Array.isArray(exRaw?.setDetails) ? (exRaw.setDetails as unknown[]) : Array.isArray(exRaw?.set_details) ? (exRaw.set_details as unknown[]) : [];
      const sdArr = Array.isArray(sdArrRaw) ? [...sdArrRaw] : [];
      const previousSetsCount = Math.max(setsHeader, sdArr.length);

      // Troca de método limpa a config antiga (mata o método fantasma); série nova
      // com método inalterado herda o advanced_config. Ver helpers/editedSetDetails.
      const prevMethod = String(exRaw?.method || 'Normal').trim() || 'Normal';
      const nextSetDetails = editedSetDetails(sdArr, desiredSets, method !== prevMethod) as WorkoutSetDetail[];

      nextExercises[idx] = {
        ...exRaw,
        name,
        method,
        sets: desiredSets,
        restTime,
        setDetails: nextSetDetails,
        isUnilateral,
        sideRestTime,
        transitionTime,
      };

      const nextLogs: Record<string, unknown> = { ...(logs && typeof logs === 'object' ? logs : {}) };
      if (previousSetsCount > desiredSets) {
        for (let i = desiredSets; i < previousSetsCount; i += 1) {
          try {
            delete nextLogs[`${idx}-${i}`];
          } catch { }
        }
      }
      // Troca de método: tira os blobs de método já EXECUTADOS dos logs sobreviventes
      // (senão o método antigo persiste no render mesmo após uma série feita).
      if (method !== prevMethod) {
        for (let i = 0; i < desiredSets; i += 1) {
          const lk = `${idx}-${i}`;
          if (lk in nextLogs) nextLogs[lk] = stripMethodBlobs(nextLogs[lk]);
        }
      }

      onUpdateSession({ workout: { ...workout, exercises: nextExercises }, logs: nextLogs });
      if (persistToPlan && editExerciseHasChanges && typeof onPersistWorkoutTemplate === 'function') {
        onPersistWorkoutTemplate({ ...workout, exercises: nextExercises } as UnknownRecord);
      }
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
    organizeBaseKeysRef.current = draftOrderKeys(safeDraft);
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
      // Mapa índice-antigo → índice-novo (por IDENTIDADE de objeto: applyExerciseOrder
      // preserva as referências). Sem remapear, os logs/collapsed/linked ficavam presos
      // no índice antigo e cada card passava a mostrar o dado de OUTRO exercício.
      const remap = new Map<number, number>();
      orderedExercises.forEach((exObj, newIdx) => {
        const oldIdx = exercises.indexOf(exObj as WorkoutExercise);
        if (oldIdx >= 0) remap.set(oldIdx, newIdx);
      });
      const remapIdx = (i: number) => (remap.has(i) ? (remap.get(i) as number) : i);
      const nextLogs: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(logs && typeof logs === 'object' ? logs : {})) {
        const dash = k.indexOf('-');
        if (dash === -1) { nextLogs[k] = v; continue; }
        const exI = parseInt(k.slice(0, dash), 10);
        if (Number.isNaN(exI) || !remap.has(exI)) { nextLogs[k] = v; continue; }
        nextLogs[`${remap.get(exI)}${k.slice(dash)}`] = v;
      }
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
        onUpdateSession({ workout: { ...workout, exercises: orderedExercises }, logs: nextLogs });
      }
      // collapsed e linked-weights seguem o mesmo remapeamento de índice
      setCollapsed((prev) => { const n = new Set<number>(); for (const i of prev) n.add(remapIdx(i)); return n; });
      setLinkedWeightExercises((prev) => { const n = new Set<number>(); for (const i of prev) n.add(remapIdx(i)); return n; });
      organizeBaseKeysRef.current = draftOrderKeys(organizeDraft);
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


  const openDeleteConfirm = (exIdx: number) => setDeleteConfirmIdx(exIdx);
  const closeDeleteConfirm = () => setDeleteConfirmIdx(null);

  const removeExerciseFromWorkout = async (fromPlan: boolean) => {
    if (!workout || typeof onUpdateSession !== 'function') return;
    const idx = deleteConfirmIdx;
    if (idx === null || idx < 0 || idx >= exercises.length) return;

    const nextExercises = exercises.filter((_, i) => i !== idx);

    // Drop logs for removed exercise, re-index subsequent exercise indices
    const nextLogs: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(logs as Record<string, unknown>)) {
      const dash = key.indexOf('-');
      if (dash === -1) { nextLogs[key] = value; continue; }
      const exI = parseInt(key.slice(0, dash), 10);
      if (isNaN(exI)) { nextLogs[key] = value; continue; }
      if (exI === idx) continue;
      nextLogs[exI > idx ? `${exI - 1}${key.slice(dash)}` : key] = value;
    }

    setCollapsed((prev) => {
      const next = new Set<number>();
      for (const i of prev) { if (i !== idx) next.add(i > idx ? i - 1 : i); }
      return next;
    });
    setLinkedWeightExercises((prev) => {
      const next = new Set<number>();
      for (const i of prev) { if (i !== idx) next.add(i > idx ? i - 1 : i); }
      return next;
    });

    // reindexa o exercício atual (rodapé/Ilha Dinâmica) pra seguir o deslocamento —
    // sem isso, após remover um exercício ANTES do atual, o rodapé apontava pro errado.
    if (typeof currentExerciseIdx === 'number' && typeof setCurrentExerciseIdx === 'function') {
      if (currentExerciseIdx > idx) setCurrentExerciseIdx(currentExerciseIdx - 1);
      else if (currentExerciseIdx === idx) setCurrentExerciseIdx(Math.max(0, Math.min(idx, nextExercises.length - 1)));
    }

    setDeleteConfirmIdx(null);
    onUpdateSession({ workout: { ...workout, exercises: nextExercises }, logs: nextLogs });

    if (fromPlan) {
      const workoutId = String(workout?.id ?? (workout as Record<string, unknown>)?.workout_id ?? '').trim();
      if (!workoutId) {
        try { await alert('Não foi possível salvar: treino sem ID.'); } catch { }
        return;
      }
      try {
        const response = await fetch('/api/workouts/update', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: workoutId, workout: { ...workout, exercises: nextExercises } }),
        }).catch((): null => null);
        const result = response ? await response.json().catch((): null => null) : null;
        if (!response?.ok || !(result as Record<string, unknown>)?.ok) {
          try { await alert(String((result as Record<string, unknown>)?.error || 'Falha ao salvar no plano.')); } catch { }
        }
      } catch (e: unknown) {
        const msg = isObject(e) && typeof e.message === 'string' ? e.message : 'Falha ao salvar no plano.';
        try { await alert(msg); } catch { }
      }
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

  // ── Editor completo DURANTE o treino ativo ─────────────────────────────────
  // O botão "+ Exercício" abre o ExerciseEditor completo (cardio, métodos,
  // apagar/reordenar). Ao salvar, os logs das séries já feitas são remapeados
  // por chave estável e o usuário escolhe "só hoje" (sessão) ou "pra sempre"
  // (template). O estado do editor vive aqui (local).
  const [fullEditorOpen, setFullEditorOpen] = useState(false);
  const [fullEditorWorkout, setFullEditorWorkout] = useState<UnknownRecord | null>(null);

  const openFullEditor = () => {
    if (!workout) return;
    setFullEditorWorkout({ ...workout, exercises: tagExercisesForEdit(exercises) });
    setFullEditorOpen(true);
  };

  const closeFullEditor = () => {
    setFullEditorOpen(false);
    setFullEditorWorkout(null);
  };

  const saveFullEditor = async (edited: UnknownRecord): Promise<{ handled: true }> => {
    if (!workout || typeof onUpdateSession !== 'function') { closeFullEditor(); return { handled: true }; }
    // Re-etiqueta a partir dos exercícios ATUAIS da sessão (inalterados durante a
    // edição) — mesmas chaves usadas ao abrir, então o casamento é exato.
    const taggedOriginal = tagExercisesForEdit(exercises);
    const editedExercises = Array.isArray((edited as UnknownRecord)?.exercises)
      ? ((edited as UnknownRecord).exercises as unknown[])
      : [];
    const { exercises: nextExercises, logs: nextLogs, remap } = reconcileEditedExercises(
      taggedOriginal,
      editedExercises,
      logs as Record<string, unknown>,
    );

    // Pergunta: só hoje (sessão) ou pra sempre (template)?
    let persist = false;
    try {
      persist = typeof confirm === 'function'
        ? await confirm(
          'Guardar estas mudanças também para as próximas vezes, ou só neste treino de hoje?',
          'Salvar edição',
          { confirmText: 'Pra sempre', cancelText: 'Só hoje' },
        )
        : false;
    } catch { persist = false; }

    // Aplica na sessão ativa (sempre).
    onUpdateSession({ workout: { ...workout, exercises: nextExercises }, logs: nextLogs });
    setCollapsed((prev) => remapIndexSet(prev, remap));
    setLinkedWeightExercises((prev) => remapIndexSet(prev, remap));
    if (typeof currentExerciseIdx === 'number' && typeof setCurrentExerciseIdx === 'function') {
      setCurrentExerciseIdx(remapCurrentIndex(currentExerciseIdx, remap, nextExercises.length));
    }

    // Persiste no template quando "pra sempre".
    if (persist) {
      const workoutId = String(workout?.id ?? (workout as UnknownRecord)?.workout_id ?? '').trim();
      if (workoutId) {
        try {
          const response = await fetch('/api/workouts/update', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: workoutId, workout: { ...workout, exercises: nextExercises } }),
          }).catch((): null => null);
          const result = response ? await response.json().catch((): null => null) : null;
          if (!response?.ok || !(result as UnknownRecord)?.ok) {
            try { await alert('As mudanças valem para hoje, mas não consegui salvar no treino para as próximas vezes.'); } catch { }
          }
        } catch {
          try { await alert('As mudanças valem para hoje, mas não consegui salvar no treino para as próximas vezes.'); } catch { }
        }
      }
    }

    closeFullEditor();
    return { handled: true };
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
    openDeleteConfirm,
    closeDeleteConfirm,
    removeExerciseFromWorkout,
    // Editor completo (treino ativo)
    fullEditorOpen,
    fullEditorWorkout,
    setFullEditorWorkout,
    openFullEditor,
    closeFullEditor,
    saveFullEditor,
  };
}
