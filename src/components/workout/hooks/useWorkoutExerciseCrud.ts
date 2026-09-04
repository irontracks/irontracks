import { useEffect, useRef, useState } from 'react';

import type { UnknownRecord, WorkoutExercise, WorkoutSetDetail } from '../types';
import { isObject } from '../utils';

import { parseTrainingNumber } from '@/utils/trainingNumber';
import { editedSetDetails, stripMethodBlobs } from '../helpers/editedSetDetails';
import { canonicalEditorMethod } from '../helpers/editorMethod';
import { applyExerciseOrder, buildExerciseDraft, draftOrderKeys } from '@/lib/workoutReorder';
import { applyPlannedSetMethod } from '@/lib/workout/plannedSetMethod';
import { persistWorkoutPlan } from '@/utils/workout/persistWorkoutPlan';
import { notaAoTrocar, juntarNota } from '@/lib/workout/exerciseNote';
import {
  tagExercisesForEdit,
  reconcileEditedExercises,
  remapIndexSet,
  remapCurrentIndex,
} from '../helpers/reconcileEditedExercises';
import type { ConfirmFn } from '@/contexts/DialogContext';

const MAX_EXTRA_SETS_PER_EXERCISE = 50;
const MAX_EXTRA_EXERCISES_PER_WORKOUT = 50;
const DEFAULT_EXTRA_EXERCISE_REST_TIME_S = 60;

interface ExerciseCrudDeps {
  workout: UnknownRecord | null;
  exercises: WorkoutExercise[];
  logs: Record<string, unknown>;
  getLog: (key: string) => UnknownRecord;
  updateLog: (key: string, patch: unknown) => void;
  collapsed: Set<number>;
  setCollapsed: React.Dispatch<React.SetStateAction<Set<number>>>;
  /**
   * Índices adiados ("fazer depois"). Anda JUNTO com `collapsed` em todo
   * remapeamento de índice: sem isso, remover ou reordenar um exercício deixa a
   * marca no índice antigo e o selo "FAZER DEPOIS" aparece no card errado — o
   * mesmo defeito que o remap de `collapsed`/`linkedWeights` existe para evitar.
   */
  setDeferredExercises: React.Dispatch<React.SetStateAction<Set<number>>>;
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
  confirm: ConfirmFn;
}

export function useWorkoutExerciseCrud(deps: ExerciseCrudDeps) {
  const {
    workout, exercises, logs,
    updateLog,
    setCollapsed,
    setDeferredExercises,
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

  /**
   * Pergunta se a mudança de séries vale só para HOJE ou também para o plano.
   *
   * Antes, adicionar/remover série mexia só na sessão e o plano nunca mudava —
   * quem ajustava o treino de verdade tinha que repetir o ajuste toda semana, sem
   * nenhuma pista de que aquilo era temporário.
   *
   * "Só neste treino" é o botão em DESTAQUE (padrão seguro escolhido pelo dono):
   * alterar o plano é irreversível pela tela do treino ativo, então exige uma
   * escolha consciente. Sem o persistidor disponível, não pergunta nada — não faz
   * sentido oferecer uma opção que não dá pra cumprir.
   */
  const askPersistSetChange = async (kind: 'add' | 'remove', nextWorkout: UnknownRecord) => {
    if (typeof onPersistWorkoutTemplate !== 'function') return;
    try {
      const onlyToday = await confirm(
        kind === 'add'
          ? 'Salvar esta série a mais só neste treino, ou também no plano (vale para os próximos)?'
          : 'Remover esta série só neste treino, ou também do plano (vale para os próximos)?',
        kind === 'add' ? 'Série adicionada' : 'Série removida',
        { confirmText: 'Só neste treino', cancelText: 'Salvar no plano' },
      );
      if (!onlyToday) onPersistWorkoutTemplate(nextWorkout);
    } catch { /* diálogo indisponível → mantém só na sessão (o padrão seguro) */ }
  };

  /**
   * Troca o método de UMA série — e pergunta se vale só hoje ou também no plano.
   *
   * A escolha entra na SESSÃO sempre, antes de perguntar: quem tocou no seletor
   * quer treinar aquela série assim agora, e a pergunta é sobre o plano. Se ela
   * dependesse da resposta, fechar o diálogo por fora deixaria o toque sem
   * efeito nenhum.
   *
   * "Só neste treino" é o botão em DESTAQUE, como em `askPersistSetChange`:
   * mexer no plano pela tela do treino ativo é irreversível ali e exige escolha
   * consciente. Sem persistidor (treino que não é template do usuário), nem
   * pergunta — oferecer o que não dá para cumprir é pior que não oferecer.
   */
  const changeSetMethod = async (exIdxRaw: unknown, setIdxRaw: unknown, method: unknown, patch?: UnknownRecord) => {
    const exIdx = Number(exIdxRaw);
    const setIdx = Number(setIdxRaw);
    const escolhido = String(method ?? '').trim();
    if (!Number.isInteger(exIdx) || !Number.isInteger(setIdx) || !escolhido) return;
    if (typeof updateLog !== 'function') return;

    updateLog(`${exIdx}-${setIdx}`, { ...(isObject(patch) ? patch : {}), per_set_method: escolhido });

    if (typeof onPersistWorkoutTemplate !== 'function' || !workout) return;
    try {
      const onlyToday = await confirm(
        `Usar ${escolhido} nesta série só neste treino, ou também no plano (vale para os próximos)?`,
        'Método da série',
        { confirmText: 'Só neste treino', cancelText: 'Salvar no plano' },
      );
      if (onlyToday) return;
      const nextExercises = applyPlannedSetMethod(exercises, exIdx, setIdx, escolhido);
      if (!nextExercises) return;
      const nextWorkout = { ...workout, exercises: nextExercises };
      onUpdateSession?.({ workout: nextWorkout });
      onPersistWorkoutTemplate(nextWorkout);
    } catch { /* diálogo indisponível → a troca fica só na sessão (o padrão seguro) */ }
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
      await askPersistSetChange('add', { ...workout, exercises: nextExercises });
    } catch (e: unknown) {
      try {
        const msg = isObject(e) && typeof e.message === 'string' ? e.message : String(e || '');
        await alert('Não foi possível adicionar série extra: ' + msg);
      } catch { }
    }
  };

  /**
   * Remove UMA série pelo índice — não só a última.
   *
   * A lixeira do card sempre foi um `pop()` cego: quem precisava tirar a 2ª de
   * quatro séries tinha que apagar as três de cima e refazer (relato do dono,
   * 19/08/2026). Com métodos avançados isso é pior ainda, porque a série do meio
   * costuma ser justamente a que carrega a configuração (drop, cluster…).
   *
   * O que vai junto e é a parte que quebra em silêncio: os logs são um mapa
   * `"exIdx-setIdx"`, então remover do MEIO precisa DESLOCAR as chaves seguintes.
   * Sem isso, apagar a série 2 deixaria a série 3 exibindo o log da 4 (o índice
   * some, os vizinhos escorregam) — dado certo na chave errada, que é pior que
   * dado perdido.
   */
  const removeSetAtIndex = async (
    exIdx: unknown,
    setIdx: unknown,
    opts?: { freezeMethods?: Record<number, string> },
  ) => {
    if (!workout || typeof onUpdateSession !== 'function') return;
    const idx = Number(exIdx);
    const sIdx = Number(setIdx);
    if (!Number.isFinite(idx) || idx < 0) return;
    if (idx >= exercises.length) return;
    if (!Number.isFinite(sIdx) || sIdx < 0) return;
    try {
      const nextExercises = [...exercises];
      const exRaw = nextExercises[idx] && typeof nextExercises[idx] === 'object' ? nextExercises[idx] : {};
      const setsHeader = Math.max(0, Number.parseInt(String(exRaw?.sets ?? '0'), 10) || 0);
      const sdArrRaw = Array.isArray(exRaw?.setDetails) ? exRaw.setDetails : Array.isArray(exRaw?.set_details) ? exRaw.set_details : [];
      const sdArr = Array.isArray(sdArrRaw) ? [...sdArrRaw] : [];
      const setsCount = Math.max(setsHeader, sdArr.length);

      // Prevent deleting if there are only 0 or 1 sets left
      if (setsCount <= 1) return;
      if (sIdx >= setsCount) return;

      // O header pode ser maior que a lista de detalhes (séries "virtuais", sem
      // detalhe próprio). Só há o que tirar do array quando o índice existe nele.
      if (sIdx < sdArr.length) sdArr.splice(sIdx, 1);
      // Renumera o que sobrou: `set_number` é 1-based e vira rótulo no relatório.
      for (let i = 0; i < sdArr.length; i += 1) {
        const d = sdArr[i];
        if (d && typeof d === 'object') sdArr[i] = { ...(d as UnknownRecord), set_number: i + 1 };
      }

      nextExercises[idx] = {
        ...exRaw,
        sets: setsCount - 1,
        setDetails: sdArr,
      };

      const prevLogs: Record<string, unknown> = (logs && typeof logs === 'object' ? logs : {}) as Record<string, unknown>;
      const nextLogs: Record<string, unknown> = {};
      /**
       * Método a CONGELAR por série, antes do deslize.
       *
       * Precisa entrar AQUI, e não num `updateLog` separado feito instantes
       * antes da chamada: o `nextLogs` é montado a partir do `logs` do render
       * atual, então qualquer escrita anterior seria sobrescrita por este
       * objeto. Foi assim que a 1ª tentativa de corrigir o bug passou nos
       * testes e falhou no aparelho.
       *
       * Por que congelar: o método pode ser DERIVADO — a nota "DROP-SET na
       * última série" injeta o drop em quem for a última. Remover a última
       * fazia a regra escorregar para a vizinha, e parecia que o app tinha
       * apagado a série errada (relato do dono, 24/08/2026).
       */
      const freeze = opts?.freezeMethods && typeof opts.freezeMethods === 'object' ? opts.freezeMethods : null;
      const withFrozenMethod = (kSet: number, value: unknown): unknown => {
        const method = freeze ? String(freeze[kSet] ?? '').trim() : '';
        if (!method) return value;
        const base = value && typeof value === 'object' ? (value as UnknownRecord) : {};
        return { ...base, per_set_method: method };
      };

      for (const [k, v] of Object.entries(prevLogs)) {
        const m = /^(\d+)-(\d+)$/.exec(k);
        if (!m) { nextLogs[k] = v; continue; }
        const kEx = Number(m[1]);
        const kSet = Number(m[2]);
        if (kEx !== idx) { nextLogs[k] = v; continue; }
        if (kSet === sIdx) continue;              // a série removida
        if (kSet > sIdx) nextLogs[`${kEx}-${kSet - 1}`] = withFrozenMethod(kSet, v);  // desliza pra baixo
        else nextLogs[k] = withFrozenMethod(kSet, v);
      }
      // Série SEM log ainda (o usuário nem tocou nela) também precisa da marca —
      // é o caso mais comum: a série vazia que viraria a última.
      if (freeze) {
        for (const [rawSet, method] of Object.entries(freeze)) {
          const kSet = Number(rawSet);
          if (!Number.isFinite(kSet) || kSet === sIdx) continue;
          const destino = kSet > sIdx ? kSet - 1 : kSet;
          const key = `${idx}-${destino}`;
          if (nextLogs[key]) continue;
          const m2 = String(method || '').trim();
          if (m2) nextLogs[key] = { per_set_method: m2 };
        }
      }

      onUpdateSession({ workout: { ...workout, exercises: nextExercises }, logs: nextLogs });
      await askPersistSetChange('remove', { ...workout, exercises: nextExercises });
    } catch (e: unknown) {
      try {
        const msg = isObject(e) && typeof e.message === 'string' ? e.message : String(e || '');
        await alert('Não foi possível remover a série: ' + msg);
      } catch { }
    }
  };

  /** Atalho legado: remove a ÚLTIMA série. Um caminho só, para não divergirem. */
  const removeExtraSetFromExercise = async (exIdx: unknown) => {
    const idx = Number(exIdx);
    if (!Number.isFinite(idx) || idx < 0 || idx >= exercises.length) return;
    const exRaw = exercises[idx] && typeof exercises[idx] === 'object' ? exercises[idx] : ({} as WorkoutExercise);
    const setsHeader = Math.max(0, Number.parseInt(String(exRaw?.sets ?? '0'), 10) || 0);
    const sdArrRaw = Array.isArray(exRaw?.setDetails) ? exRaw.setDetails : Array.isArray((exRaw as UnknownRecord)?.set_details) ? ((exRaw as UnknownRecord).set_details as unknown[]) : [];
    const setsCount = Math.max(setsHeader, Array.isArray(sdArrRaw) ? sdArrRaw.length : 0);
    if (setsCount <= 1) return;
    await removeSetAtIndex(idx, setsCount - 1);
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
      // Normaliza a grafia pro valor do dropdown (ex.: "Drop-Set" → "Drop-set"),
      // senão o <select> não casa e mostra "Normal" (e salvar perderia o método).
      const method = canonicalEditorMethod(ex?.method);
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
      const saved = await persistWorkoutPlan(workoutId, payload, { deferNotify: true });
      if (!saved.ok) {
        setOrganizeError(saved.error || 'Falha ao salvar a ordem.');
        setOrganizeSaving(false);
        return;
      }
      if (typeof onUpdateSession === 'function') {
        onUpdateSession({ workout: { ...workout, exercises: orderedExercises }, logs: nextLogs });
      }
      // collapsed e linked-weights seguem o mesmo remapeamento de índice
      setCollapsed((prev) => { const n = new Set<number>(); for (const i of prev) n.add(remapIdx(i)); return n; });
      setDeferredExercises((prev) => { const n = new Set<number>(); for (const i of prev) n.add(remapIdx(i)); return n; });
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
    setDeferredExercises((prev) => {
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
      // persistWorkoutPlan invalida a lista de treinos ao confirmar. Sem isso, o
      // exercício removido continuava aparecendo até reiniciar o app (bug real,
      // reportado em ago/2026 justamente com um exercício apagado no treino ativo).
      const saved = await persistWorkoutPlan(workoutId, { ...workout, exercises: nextExercises }, { deferNotify: true });
      if (!saved.ok) {
        try { await alert(saved.error || 'Falha ao salvar no plano.'); } catch { }
      }
    }
  };

  /** Directly rename an exercise by index — used by AI swap. */
  /**
   * Troca o nome do exercício — e cuida da OBSERVAÇÃO, que antes sobrevivia
   * descrevendo o aparelho anterior.
   *
   * Medido em produção (03/09/2026): 322 das 384 observações são técnica do
   * aparelho ("pés na parte alta da plataforma"), 181 caracteres de média.
   * Como este método preserva o resto do objeto no spread, a nota do exercício
   * velho continuava na tela instruindo sobre uma máquina que saiu.
   *
   * `gerarNota` é OPT-IN de propósito: a troca individual pede a nota nova à
   * IA, e "Adaptar ambiente" — que troca o treino inteiro num toque — NÃO,
   * senão um gesto viraria N chamadas pagas ao Gemini.
   */
  const swapExerciseName = (exIdx: number, newName: string, opts?: { gerarNota?: boolean }) => {
    if (!workout || typeof onUpdateSession !== 'function') return;
    if (exIdx < 0 || exIdx >= exercises.length) return;
    const trimmed = newName.trim();
    if (!trimmed) return;
    try {
      const nextExercises = [...exercises];
      const exRaw = nextExercises[exIdx] && typeof nextExercises[exIdx] === 'object' ? nextExercises[exIdx] : {} as WorkoutExercise;
      const notaAntiga = String((exRaw as { notes?: unknown })?.notes ?? '');
      // Vazio é melhor que mentiroso: sai a descrição do aparelho velho, fica
      // só o que CONFIGURA método (o card parseia SST/drop dali).
      const metodoPreservado = notaAoTrocar(notaAntiga);
      nextExercises[exIdx] = { ...exRaw, name: trimmed, notes: metodoPreservado };
      onUpdateSession({ workout: { ...workout, exercises: nextExercises } });
      if (opts?.gerarNota) void gerarNotaDoExercicio(exIdx, trimmed, metodoPreservado);
    } catch { /* silent */ }
  };

  /**
   * Busca a técnica do exercício novo e a costura com o método preservado.
   *
   * Roda solta (`void`): a troca já aconteceu na tela e não pode esperar rede —
   * o usuário está de pé na academia. Falha em silêncio de propósito, e o custo
   * de falhar é o estado honesto (sem observação), nunca a nota errada.
   */
  const gerarNotaDoExercicio = async (exIdx: number, nome: string, metodo: string) => {
    try {
      const r = await fetch('/api/ai/exercise-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exerciseName: nome }),
      });
      if (!r.ok) return;
      const j = await r.json().catch(() => null);
      const nota = String(j?.note ?? '').trim();
      if (!nota) return;
      const { workout: wFresco, exercises: exFrescos } = estadoFrescoRef.current;
      if (!wFresco || !Array.isArray(exFrescos)) return;
      if (exIdx < 0 || exIdx >= exFrescos.length) return;
      const alvo = exFrescos[exIdx] as UnknownRecord | null;
      // Só preenche se ainda for o MESMO exercício e a nota continuar sendo o
      // que a troca deixou — se o usuário já escreveu algo, a palavra é dele.
      if (!alvo || String(alvo.name ?? '') !== nome) return;
      if (String(alvo.notes ?? '').trim() !== metodo.trim()) return;
      const lista = [...exFrescos];
      lista[exIdx] = { ...alvo, notes: juntarNota(metodo, nota), notesSource: 'ai' };
      onUpdateSession?.({ workout: { ...wFresco, exercises: lista } });
    } catch { /* rede ruim na academia é o caso comum, não a exceção */ }
  };

  // ── Editor completo DURANTE o treino ativo ─────────────────────────────────
  // O botão "+ Exercício" abre o ExerciseEditor completo (cardio, métodos,
  // apagar/reordenar). Ao salvar, os logs das séries já feitas são remapeados
  // por chave estável e o usuário escolhe "só hoje" (sessão) ou "pra sempre"
  // (template). O estado do editor vive aqui (local).
  /**
   * Espelho do estado atual para o código ASSÍNCRONO ler.
   *
   * `onUpdateSession` só aceita objeto — não tem updater funcional —, então a
   * nota que volta da IA precisa conferir a lista FRESCA por conta própria:
   * entre o disparo e a resposta o usuário pode ter trocado de novo, editado
   * ou apagado o exercício, e escrever por cima de uma lista velha
   * ressuscitaria o que ele acabou de mudar.
   *
   * Alimentada em efeito, nunca no render (React 19 proíbe escrever ref
   * durante o render).
   */
  const estadoFrescoRef = useRef<{ workout: typeof workout; exercises: typeof exercises }>({ workout, exercises });
  useEffect(() => { estadoFrescoRef.current = { workout, exercises }; }, [workout, exercises]);

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
    setDeferredExercises((prev) => remapIndexSet(prev, remap));
    setLinkedWeightExercises((prev) => remapIndexSet(prev, remap));
    if (typeof currentExerciseIdx === 'number' && typeof setCurrentExerciseIdx === 'function') {
      setCurrentExerciseIdx(remapCurrentIndex(currentExerciseIdx, remap, nextExercises.length));
    }

    // Persiste no template quando "pra sempre".
    if (persist) {
      const workoutId = String(workout?.id ?? (workout as UnknownRecord)?.workout_id ?? '').trim();
      if (workoutId) {
        const saved = await persistWorkoutPlan(workoutId, { ...workout, exercises: nextExercises }, { deferNotify: true });
        if (!saved.ok) {
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
    changeSetMethod,
    removeExtraSetFromExercise,
    removeSetAtIndex,
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
