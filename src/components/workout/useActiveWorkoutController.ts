
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { logError } from '@/lib/logger';
// Note: useWorkoutTicker is no longer called here — it lives in WorkoutTimerProvider.
// The controller no longer re-renders every second, only on user interaction.
import { useWorkoutModals } from './hooks/useWorkoutModals';
import { useWorkoutDeload } from './hooks/useWorkoutDeload';
import { useWorkoutExerciseCrud } from './hooks/useWorkoutExerciseCrud';
import { useWorkoutFinish } from './hooks/useWorkoutFinish';
import { useWorkoutMethodSavers } from './hooks/useWorkoutMethodSavers';
import { useDialog } from '@/contexts/DialogContext';
import { useTeamWorkout } from '@/contexts/TeamWorkoutContext';
import {
  ActiveWorkoutProps,
  UnknownRecord,
  WorkoutDraft,
  WorkoutExercise,
} from './types';
import { isObject, shouldOpenFinishPrompt, buildWorkoutSummary } from './utils';
import {
  getPlanConfig,
  getPlannedSet,
} from './helpers/setPlanningHelpers';
import { HELP_TERMS } from '@/utils/help/terms';

// parseStartedAtMs moved to ActiveWorkout.tsx (timer provider) and useWorkoutFinish.ts

export function useActiveWorkoutController(props: ActiveWorkoutProps) {
  const { alert, confirm } = useDialog();
  // Bridge DialogContext alert (Promise<boolean>) to Promise<void> for child hooks
  const alertVoid = useCallback(async (msg: string, title?: string): Promise<void> => { await alert(msg, title); }, [alert]);
  const teamWorkout = useTeamWorkout() as unknown as {
    sendInvite: (targetUser: unknown, workout: UnknownRecord) => Promise<unknown>
    broadcastMyLog: (exIdx: number, sIdx: number, weight: string, reps: string) => void
    broadcastWorkoutEdit: (workout: UnknownRecord) => void
    teamSession: { id: string; isHost: boolean; participants: unknown[] } | null
    sharedLogs: Record<string, Record<string, { exIdx: number; sIdx: number; weight: string; reps: string; ts: number }>>
    exerciseControlUpdates: Array<{ fromUserId: string; exerciseIdx: number; setIdx: number; patch: Record<string, unknown>; ts: number }>
  };
  const sendInvite = teamWorkout.sendInvite;
  const broadcastMyLog = teamWorkout.broadcastMyLog
  const broadcastWorkoutEdit = teamWorkout.broadcastWorkoutEdit
  const teamSession = teamWorkout.teamSession
  const session = props.session;
  const workout = session?.workout ?? null;
  const workoutExercises = workout?.exercises;
  const exercises = useMemo<WorkoutExercise[]>(() => (Array.isArray(workoutExercises) ? workoutExercises : []), [workoutExercises]);

  const logs = useMemo<Record<string, unknown>>(() => (session?.logs ?? {}) as Record<string, unknown>, [session?.logs]);
  // ── logsRef: always reflects the LATEST logs, even before React re-renders.
  // This prevents the stale-closure race condition where a rapid sequence of
  // updateLog calls (e.g., RPE input → OK click) causes the second call to
  // read a stale `prev` that was captured before the first update propagated,
  // erasing the user's typed values.
  //
  // DEEP MERGE instead of replace: when a parent re-render (e.g., from the 1-s
  // sessionTicker) fires BETWEEN an eager logsRef write and React processing
  // the corresponding setActiveSession, a plain `logsRef.current = logs` would
  // clobber the eagerly-written fields (weight, reps, rpe, done…) because
  // `logs` still reflects the old React state.  By merging React's `logs`
  // ON TOP of the ref, eagerly-written fields survive until React catches up.
  const logsRef = useRef<Record<string, unknown>>(logs);
  {
    const prev = logsRef.current;
    // Reconstrói SÓ com as chaves presentes no estado React (`logs`). Antes
    // começava de `{...prev}` e nunca descartava as chaves que saíam do estado
    // (série/exercício removido, edição mid-sessão, remap) — esses "órfãos"
    // sobreviviam no ref e, como getLog lê do ref, vazavam dado fantasma pra
    // séries/exercícios reaproveitando o mesmo índice ("exIdx-setIdx"): série
    // renascia preenchida/feita, RPE de exercício deletado aparecia no de cima.
    // Cada updateLog chama onUpdateLog → a chave reaparece no `logs` do React no
    // próximo render, então o merge eager (fromRef) é preservado pras chaves
    // vivas; só os órfãos são dropados.
    const next: Record<string, unknown> = {};
    for (const k of Object.keys(logs)) {
      const fromRef = isObject(prev[k]) ? (prev[k] as Record<string, unknown>) : null;
      const fromReact = isObject(logs[k]) ? (logs[k] as Record<string, unknown>) : null;
      if (fromRef && fromReact) {
        // React state wins for shared fields; ref keeps eagerly-written fields
        next[k] = { ...fromRef, ...fromReact };
      } else {
        next[k] = logs[k];
      }
    }
    logsRef.current = next;
  }
  // propsRef: stable reference to latest props so callbacks can access them without rebuilding
  const propsRef = useRef(props);
  propsRef.current = props;
  // Memoiza `ui` pra estabilizar referência — sem isso, o `??` cria literal `{}`
  // a cada render quando session.ui é null/undefined, invalidando o useMemo do return.
  const ui: UnknownRecord = useMemo(() => (session?.ui ?? {}) as UnknownRecord, [session?.ui]);
  const settings = props.settings ?? null;

  // ticker/timerMinimized now live in WorkoutTimerContext (separate provider)
  // This prevents the controller from re-rendering every second.

  // Persist collapsed card indices across app restarts
  const collapsedKey = (() => {
    const id = String(session?.id || (session as Record<string, unknown>)?.startedAt || '').trim();
    return id ? `irontracks.collapsed.v1.${id}` : null;
  })();

  const {
    collapsed, setCollapsed,
    openNotesKeys, setOpenNotesKeys,
    inviteOpen, setInviteOpen,
    linkedWeightExercises, setLinkedWeightExercises,
    currentExerciseIdx, setCurrentExerciseIdx,
    finishing, setFinishing,
    addExerciseOpen, setAddExerciseOpen,
    addExerciseDraft, setAddExerciseDraft,
    deleteConfirmIdx, setDeleteConfirmIdx,
    editExerciseOpen, setEditExerciseOpen,
    editExerciseIdx, setEditExerciseIdx,
    editExerciseDraft, setEditExerciseDraft,
    setEditExerciseOriginal,
    persistToPlan, setPersistToPlan,
    editExerciseHasChanges,
    organizeOpen, setOrganizeOpen,
    organizeDraft, setOrganizeDraft,
    organizeSaving, setOrganizeSaving,
    organizeError, setOrganizeError,
    organizeBaseKeysRef,
    organizeDirty,
    postCheckinOpen, setPostCheckinOpen,
    postCheckinDraft, setPostCheckinDraft,
    postCheckinResolveRef,
    clusterModal, setClusterModal,
    restPauseModal, setRestPauseModal,
    dropSetModal, setDropSetModal,
    strippingModal, setStrippingModal,
    fst7Modal, setFst7Modal,
    heavyDutyModal, setHeavyDutyModal,
    pontoZeroModal, setPontoZeroModal,
    forcedRepsModal, setForcedRepsModal,
    negativeRepsModal, setNegativeRepsModal,
    partialRepsModal, setPartialRepsModal,
    sistema21Modal, setSistema21Modal,
    waveModal, setWaveModal,
    groupMethodModal, setGroupMethodModal,
    restPauseRefs,
    clusterRefs,
    restPauseDraftsRef,
    dropSetDraftsRef,
  } = useWorkoutModals(collapsedKey);


  const getLog = useCallback((key: string): UnknownRecord => {
    const v = logsRef.current[key];
    return isObject(v) ? v : {};
  }, []);

  const updateLog = useCallback((key: string, patch: unknown) => {
    try {
      if (typeof propsRef.current?.onUpdateLog !== 'function') return;

      const patchObj: UnknownRecord = isObject(patch) ? patch : {};
      const [exIdxStr, sIdxStr] = key.split('-');
      const exIdx = parseInt(exIdxStr, 10);
      const sIdx = parseInt(sIdxStr, 10);

      // Haptic feedback when completing a set
      if (patchObj.done === true) {
        // Check if this is the last set of the exercise (exercise completion)
        const ex = exercises[exIdx];
        const setsHeader = ex ? Math.max(0, Number.parseInt(String(ex?.sets ?? '0'), 10) || 0) : 0;
        const sdArr: unknown[] = ex && Array.isArray(ex?.setDetails) ? (ex.setDetails as unknown[]) : ex && Array.isArray(ex?.set_details) ? (ex.set_details as unknown[]) : [];
        const setsCount = Math.max(setsHeader, Array.isArray(sdArr) ? sdArr.length : 0);
        const doneBefore = Array.from({ length: setsCount }).filter((_, i) => i !== sIdx && getLog(`${exIdx}-${i}`)?.done).length;
        const isExerciseComplete = setsCount > 0 && doneBefore === setsCount - 1;
        if (isExerciseComplete) {
          // Exercise complete — double tap pattern
          try { navigator?.vibrate?.([15, 30, 15]) } catch { /* not supported */ }
        } else {
          // Single set done — short tap
          try { navigator?.vibrate?.(10) } catch { /* not supported */ }
        }
      }

      // If weight changes and this exercise has linked weights enabled, update all sets
      if (linkedWeightExercises.has(exIdx) && 'weight' in patchObj) {
        const ex = exercises[exIdx];
        if (ex) {
          const setsHeader = Math.max(0, Number.parseInt(String(ex?.sets ?? '0'), 10) || 0);
          const sdArr: unknown[] = Array.isArray(ex?.setDetails) ? (ex.setDetails as unknown[]) : Array.isArray(ex?.set_details) ? (ex.set_details as unknown[]) : [];
          const setsCount = Math.max(setsHeader, Array.isArray(sdArr) ? sdArr.length : 0);

          for (let setIdx = 0; setIdx < setsCount; setIdx++) {
            const linkedKey = `${exIdx}-${setIdx}`;
            const prev = getLog(linkedKey);
            // A série ATUAL recebe o patch COMPLETO (done/reps/set_type/etc); as demais
            // recebem só o peso. Antes o early-return propagava o peso e DESCARTAVA o
            // resto do que foi digitado na série atual (a série nem marcava como feita).
            const linkedMerged = setIdx === sIdx ? { ...prev, ...patchObj } : { ...prev, weight: patchObj.weight };
            propsRef.current.onUpdateLog(linkedKey, linkedMerged);
            logsRef.current = { ...logsRef.current, [linkedKey]: linkedMerged };
          }
          // Broadcast linked weight update for first set only
          try {
            const w = String(patchObj.weight ?? '')
            if (broadcastMyLog && w) broadcastMyLog(exIdx, 0, w, String(patchObj.reps ?? getLog(`${exIdx}-0`)?.reps ?? ''))
          } catch (e) { logError('hook:useActiveWorkoutController.broadcastLinked', e) }
          return;
        }
      }

      const prev = getLog(key);
      const merged = { ...prev, ...patchObj };
      propsRef.current.onUpdateLog(key, merged);

      // ── Eagerly update logsRef so the NEXT updateLog call in the same
      // React batch sees the value we just wrote. Without this, rapid
      // sequences like blur → click (common on iOS WKWebView) cause the
      // second call to read a stale `prev` that's missing the first
      // call's fields (e.g., weight typed just before pressing OK).
      logsRef.current = { ...logsRef.current, [key]: merged };

      // Broadcast log update to team partners
      try {
        if (broadcastMyLog && Number.isFinite(exIdx) && Number.isFinite(sIdx)) {
          const merged = { ...prev, ...patchObj }
          const w = String(merged.weight ?? '')
          const r = String(merged.reps ?? '')
          if (w || r) broadcastMyLog(exIdx, sIdx, w, r)
        }
      } catch (e) { logError('hook:useActiveWorkoutController.broadcastLog', e) }
    } catch (e) { logError('hook:useActiveWorkoutController.updateLog', e) }
  }, [exercises, linkedWeightExercises, broadcastMyLog, getLog]);

  // ── Set type (working / warmup / feeler) ─────────────────────────────────
  // Writes to the active log so the change is part of the session payload on
  // finish. `is_warmup` is kept in sync for retrocompat with older readers
  // (mapWorkoutRow, history report HTML, etc) that still branch on it.
  const updateSetType = useCallback((exIdx: number, setIdx: number, type: 'working' | 'warmup' | 'feeler') => {
    const key = `${exIdx}-${setIdx}`;
    updateLog(key, { set_type: type, is_warmup: type === 'warmup' });
  }, [updateLog]);

  // ── Apply partner exercise control updates ───────────────────────────────
  const exerciseControlUpdates = teamWorkout.exerciseControlUpdates
  // Dedup POR SÉRIE (exIdx-setIdx), não por um ts global: o spotter emite vários
  // patches num mesmo tick (ex.: um por série num drop-set) com o mesmo Date.now()
  // em ms — com um ts único, só o 1º era aplicado e os demais sumiam.
  const lastAppliedTsByKey = useRef<Record<string, number>>({})
  useEffect(() => {
    if (!exerciseControlUpdates?.length) return
    for (const update of exerciseControlUpdates) {
      const key = `${update.exerciseIdx}-${update.setIdx}`
      if (update.ts <= (lastAppliedTsByKey.current[key] ?? 0)) continue
      lastAppliedTsByKey.current[key] = update.ts
      try {
        const prev = getLog(key)
        const merged = { ...prev, ...update.patch }
        if (typeof propsRef.current?.onUpdateLog === 'function') {
          propsRef.current.onUpdateLog(key, merged)
        }
        // Atualiza a "memória rápida" (logsRef) na hora: sem isso, uma ação local logo
        // em seguida lia o logsRef velho e sobrescrevia a mudança do parceiro/professor.
        logsRef.current = { ...logsRef.current, [key]: merged }
      } catch (e) { logError('hook:useActiveWorkoutController.applyPartnerUpdate', e) }
    }
  }, [exerciseControlUpdates, getLog])


  // ── Deload + report history (extracted to useWorkoutDeload) ──────────────
  const deload = useWorkoutDeload({
    session, workout, exercises, logs, getLog, updateLog,
    getPlanConfig: (ex, setIdx) => getPlanConfig(ex, setIdx),
    getPlannedSet: (ex, setIdx) => getPlannedSet(ex, setIdx),
    alert: alertVoid, confirm,
  });
  const {
    reportHistory, reportHistoryStatus, reportHistoryUpdatedAt,
    deloadSuggestions, deloadModal, setDeloadModal,
    deloadAiCacheRef, reportHistoryLoadingRef,
    reportHistoryLoadingSinceRef, reportHistoryStatusRef, reportHistoryUpdatedAtRef,
    persistDeloadHistoryFromSession,
    openDeloadModal, updateDeloadModalFromPercent, updateDeloadModalFromWeight,
    applyDeloadToExercise,
  } = deload;


  const startTimer = useCallback((seconds: unknown, context: unknown) => {
    try {
      if (typeof propsRef.current?.onStartTimer !== 'function') return;
      const s = Number(seconds);
      if (!Number.isFinite(s) || s <= 0) return;
      // Auto-inject exerciseName + nextSetLabel from key ("exIdx-setIdx") if not already provided
      const ctx = isObject(context) ? { ...(context as Record<string, unknown>) } : {};
      const key = String(ctx.key || '').trim();
      const keyParts = key ? key.split('-').map((p) => Number(p)) : [];
      const currentExIdx = keyParts[0];
      const currentSetIdx = keyParts[1];
      const currentExercises = propsRef.current?.session?.workout?.exercises;
      const exArr = Array.isArray(currentExercises) ? currentExercises : [];

      if (Number.isFinite(currentExIdx) && currentExIdx >= 0 && exArr[currentExIdx]) {
        const currentEx = exArr[currentExIdx] as Record<string, unknown>;
        if (!ctx.exerciseName) {
          ctx.exerciseName = String(currentEx?.name || '').trim() || undefined;
        }

        // Compute nextSetLabel: what set/exercise comes AFTER the one the user
        // just completed. Used by the BORA overlay to show "3ª série de Supino"
        // or "1ª série de Agachamento" so users know what's next without having
        // to close the overlay.
        if (!ctx.nextSetLabel && Number.isFinite(currentSetIdx) && currentSetIdx >= 0) {
          const setsHeader = Math.max(0, Number.parseInt(String(currentEx?.sets ?? '0'), 10) || 0);
          const sdRaw = currentEx?.setDetails ?? (currentEx as Record<string, unknown>)?.set_details;
          const sdLen = Array.isArray(sdRaw) ? sdRaw.length : 0;
          const setsCount = Math.max(setsHeader, sdLen);

          if (currentSetIdx + 1 < setsCount) {
            // Next set of the SAME exercise
            const name = String(currentEx?.name || '').trim();
            ctx.nextSetLabel = name
              ? `${currentSetIdx + 2}ª série de ${name}`
              : `${currentSetIdx + 2}ª série`;
          } else {
            // Move to next exercise's first set
            const nextEx = exArr[currentExIdx + 1] as Record<string, unknown> | undefined;
            if (nextEx) {
              const nextName = String(nextEx?.name || '').trim();
              ctx.nextSetLabel = nextName
                ? `1ª série de ${nextName}`
                : '1ª série do próximo exercício';
            }
            // else: last set of last exercise — leave nextSetLabel undefined
          }
        }
      }

      propsRef.current.onStartTimer(s, ctx);
    } catch { }
  }, []);

  /**
   * Called when the rest timer finishes or is dismissed (onFinish / onClose
   * of RestTimerOverlay via onStartTimer parent). The context carries the
   * log `key` (`"exIdx-setIdx"`) so we can:
   *   1. Compute restSeconds = now - restStartMs (stored in that log)
   *   2. Write restSeconds back to the log
   *   3. Set setStartMs = now on that same log so the NEXT set's
   *      execution time can be correctly measured
   */
  const handleTimerFinish = useCallback((context: unknown) => {
    try {
      const ctx = isObject(context) ? (context as UnknownRecord) : null;
      const key = ctx?.key ? String(ctx.key) : null;
      if (!key) return;
      const log = getLog(key);
      const rawRestStart = log.restStartMs;
      const restStartMs = typeof rawRestStart === 'number' && rawRestStart > 0 ? rawRestStart : null;
      const now = Date.now();
      const patch: UnknownRecord = { setStartMs: now };
      if (restStartMs) {
        const restSec = Math.round((now - restStartMs) / 1000);
        if (restSec > 0 && restSec < 86400) {
          patch.restSeconds = restSec;
        }
      }
      updateLog(key, patch);
    } catch { }
  }, [getLog, updateLog]);



  // ── Exercise CRUD + organize (extracted to useWorkoutExerciseCrud) ─────────
  const exerciseCrud = useWorkoutExerciseCrud({
    workout, exercises, logs, getLog,
    collapsed, setCollapsed,
    linkedWeightExercises, setLinkedWeightExercises,
    editExerciseDraft, setEditExerciseDraft,
    setEditExerciseOriginal,
    persistToPlan, setPersistToPlan,
    editExerciseHasChanges,
    onPersistWorkoutTemplate: propsRef.current.onPersistWorkoutTemplate
      ? (w: UnknownRecord) => { propsRef.current.onPersistWorkoutTemplate?.(w as WorkoutDraft); }
      : undefined,
    editExerciseIdx, setEditExerciseIdx,
    editExerciseOpen, setEditExerciseOpen,
    addExerciseDraft, setAddExerciseDraft,
    addExerciseOpen, setAddExerciseOpen,
    organizeDraft, setOrganizeDraft,
    organizeSaving, setOrganizeSaving,
    organizeError, setOrganizeError,
    organizeOpen, setOrganizeOpen,
    organizeDirty, organizeBaseKeysRef,
    currentExerciseIdx, setCurrentExerciseIdx,
    deleteConfirmIdx, setDeleteConfirmIdx,
    onUpdateSession: (updatedWorkout: UnknownRecord) => {
      props.onUpdateSession?.(updatedWorkout);
      if (teamSession?.id && typeof broadcastWorkoutEdit === 'function') {
        // Small delay to allow state to settle before serialising
        setTimeout(() => {
          try {
            // updatedWorkout is a session patch: { workout: { exercises: [...] } }
            // broadcastWorkoutEdit must receive the raw workout object so that
            // handleAcceptWorkoutEdit on the receiver can read .exercises directly
            const rawWorkout = (typeof updatedWorkout.workout === 'object' && updatedWorkout.workout !== null)
              ? updatedWorkout.workout as UnknownRecord
              : updatedWorkout;
            broadcastWorkoutEdit(rawWorkout);
          } catch { }
        }, 300);
      }
    },
    alert: alertVoid, confirm,
  });
  const {
    toggleCollapse, toggleLinkWeights,
    addExtraSetToExercise, removeExtraSetFromExercise,
    openEditExercise, saveEditExercise,
    addExtraExerciseToWorkout, swapExerciseName,
    openOrganizeModal, requestCloseOrganize, saveOrganize,
    openDeleteConfirm, closeDeleteConfirm, removeExerciseFromWorkout,
    fullEditorOpen, fullEditorWorkout, setFullEditorWorkout,
    openFullEditor, closeFullEditor, saveFullEditor,
  } = exerciseCrud;

  // ── Method savers (cluster, rest-pause, drop-set, etc) ──────────────────
  const {
    saveClusterModal,
    saveRestPauseModal,
    saveDropSetModal,
    saveStrippingModal,
    saveFst7Modal,
    saveHeavyDutyModal,
    savePontoZeroModal,
    saveForcedRepsModal,
    saveNegativeRepsModal,
    savePartialRepsModal,
    saveSistema21Modal,
    saveWaveModal,
    saveGroupMethodModal,
  } = useWorkoutMethodSavers({
    clusterModal, restPauseModal, dropSetModal, strippingModal,
    fst7Modal, heavyDutyModal, pontoZeroModal, forcedRepsModal,
    negativeRepsModal, partialRepsModal, sistema21Modal, waveModal, groupMethodModal,
    setClusterModal, setRestPauseModal, setDropSetModal, setStrippingModal,
    setFst7Modal, setHeavyDutyModal, setPontoZeroModal, setForcedRepsModal,
    setNegativeRepsModal, setPartialRepsModal, setSistema21Modal, setWaveModal, setGroupMethodModal,
    getLog, updateLog,
    startTimer,
  });

  // ── Toggle exercise notes ──────────────────────────────────────────────
  const toggleNotes = useCallback((key: string) => {
    setOpenNotesKeys((prev: Set<string>) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, [setOpenNotesKeys]);


  // ── Finish workout (extracted to useWorkoutFinish) ──────────────────────
  const finishHook = useWorkoutFinish({
    session, workout, exercises, logs, ui,
    userId: String((settings as Record<string, unknown>)?.userId ?? (session as Record<string, unknown>)?.userId ?? ''),
    settings,
    postCheckinOpen, setPostCheckinOpen,
    postCheckinDraft: postCheckinDraft as Record<string, string>,
    setPostCheckinDraft: setPostCheckinDraft as (v: Record<string, string>) => void,
    postCheckinResolveRef, persistDeloadHistoryFromSession,
    finishing, setFinishing,
    alert: alertVoid,
    confirm, onFinish: props.onFinish as ((session: unknown, showReport: boolean) => void) | undefined,
  });
  const { finishWorkout } = finishHook;



  const currentExercise = exercises[currentExerciseIdx] ?? null;

  // ── Current exercise progress (consumed by WorkoutFooter) ──────────
  const { currentExSetsCount, currentExDoneSets } = useMemo(() => {
    if (!currentExercise) return { currentExSetsCount: 0, currentExDoneSets: 0 };
    const setsHeader = Math.max(0, parseInt(String(currentExercise?.sets ?? '0'), 10) || 0);
    const sdArr = Array.isArray(currentExercise?.setDetails)
      ? currentExercise.setDetails
      : Array.isArray(currentExercise?.set_details)
        ? (currentExercise.set_details as unknown[])
        : [];
    const count = Math.max(setsHeader, Array.isArray(sdArr) ? sdArr.length : 0);
    const logsObj = logs as Record<string, Record<string, unknown>>;
    const done = count > 0 && Number.isFinite(currentExerciseIdx)
      ? Array.from({ length: count }).filter((_, i) => logsObj[`${currentExerciseIdx}-${i}`]?.done).length
      : 0;
    return { currentExSetsCount: count, currentExDoneSets: done };
  }, [currentExercise, currentExerciseIdx, logs]);

  // elapsedSeconds + formatElapsed now live in WorkoutTimerContext

  // ── Centralized progress calculation (single source of truth) ───────────
  const { completedSets, totalSets, progressPct, remainingSets } = useMemo(() => {
    let total = 0;
    let done = 0;
    exercises.forEach((ex, exIdx) => {
      const setsHeader = Math.max(0, parseInt(String(ex?.sets ?? '0'), 10) || 0);
      const sdArr = Array.isArray(ex?.setDetails) ? ex.setDetails : Array.isArray(ex?.set_details) ? (ex.set_details as unknown[]) : [];
      const count = Math.max(setsHeader, Array.isArray(sdArr) ? sdArr.length : 0);
      total += count;
      for (let i = 0; i < count; i++) {
        const log = (logs as Record<string, Record<string, unknown>>)[`${exIdx}-${i}`];
        if (log?.done) done++;
      }
    });
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    return { completedSets: done, totalSets: total, progressPct: pct, remainingSets: total - done };
  }, [exercises, logs]);

  // ── Prompt automático ao concluir TODOS os exercícios ───────────────────
  // Quando o usuário marca a última série pendente, abre um confirm
  // perguntando se quer finalizar o treino. Dispara só na TRANSIÇÃO
  // (não-completo → completo), nunca no mount/resume, e só uma vez por sessão
  // — sem "nag" se o usuário recusar (segue podendo finalizar pelo footer).
  const allExercisesComplete = totalSets > 0 && completedSets >= totalSets;
  const finishPromptedRef = useRef(false);
  const prevAllCompleteRef = useRef(allExercisesComplete);
  useEffect(() => {
    const open = shouldOpenFinishPrompt({
      allComplete: allExercisesComplete,
      prevAllComplete: prevAllCompleteRef.current,
      alreadyPrompted: finishPromptedRef.current,
      finishing,
    });
    prevAllCompleteRef.current = allExercisesComplete;
    if (!open) return;
    finishPromptedRef.current = true;
    void (async () => {
      const summary = buildWorkoutSummary(exercises, logs);
      const message = summary.text
        ? `Você concluiu todos os exercícios! Confira antes de finalizar:\n\n${summary.text}`
        : 'Você concluiu todos os exercícios! Deseja finalizar o treino agora?';
      const ok = await confirm(message, 'Treino concluído 💪', { confirmText: 'Finalizar' });
      if (ok) await finishWorkout();
    })();
  }, [allExercisesComplete, finishing, confirm, finishWorkout, exercises, logs]);

  // Memoiza o contexto inteiro pra não recriar o `value` do WorkoutProvider a
  // cada render do controller. Sem isso, qualquer mudança no controller (ticker
  // de pausa, deps do live activity, etc) faria todos os 50-80 consumers
  // (ExerciseCard, NormalSet, etc) re-renderizarem — anulando React.memo.
  // Split de context (perf): o value principal NÃO inclui `logs` (mapa cru que muda a
  // CADA tecla). Os derivados (completedSets/progressPct/...) são primitivos e só mudam
  // ao marcar série feita, então ficam aqui sem forçar re-render por tecla. `logs` é
  // servido no WorkoutLogsContext, consumido só por ExerciseList/ExerciseCard.
  // True quando QUALQUER modal/overlay do treino está aberto. Usado pelo FAB do
  // chat de equipe pra não flutuar por cima do modal — durante o descanso o FAB
  // sobe pra um z-index alto (pra clarear a barra de descanso) e acabava cobrindo
  // o botão Salvar do "Editar exercício".
  const anyModalOpen = !!(
    editExerciseOpen || addExerciseOpen || organizeOpen || fullEditorOpen ||
    postCheckinOpen || inviteOpen ||
    deloadModal || clusterModal || restPauseModal || dropSetModal || strippingModal ||
    fst7Modal || heavyDutyModal || pontoZeroModal || forcedRepsModal ||
    negativeRepsModal || partialRepsModal || sistema21Modal || waveModal || groupMethodModal
  )

  const value = useMemo(() => ({
    session,
    anyModalOpen,
    workout,
    exercises,
    ui,
    settings,
    collapsed,
    setCollapsed,
    finishing,
    openNotesKeys,
    setOpenNotesKeys,
    inviteOpen,
    setInviteOpen,
    addExerciseOpen,
    setAddExerciseOpen,
    addExerciseDraft,
    setAddExerciseDraft,
    organizeOpen,
    setOrganizeOpen,
    organizeDraft,
    setOrganizeDraft,
    organizeSaving,
    organizeDirty,
    organizeError,
    setOrganizeError,
    deloadModal,
    setDeloadModal,
    clusterModal,
    setClusterModal,
    restPauseModal,
    setRestPauseModal,
    dropSetModal,
    setDropSetModal,
    strippingModal,
    setStrippingModal,
    fst7Modal,
    setFst7Modal,
    heavyDutyModal,
    setHeavyDutyModal,
    pontoZeroModal,
    setPontoZeroModal,
    forcedRepsModal,
    setForcedRepsModal,
    negativeRepsModal,
    setNegativeRepsModal,
    partialRepsModal,
    setPartialRepsModal,
    sistema21Modal,
    setSistema21Modal,
    waveModal,
    setWaveModal,
    groupMethodModal,
    setGroupMethodModal,
    postCheckinOpen,
    setPostCheckinOpen,
    postCheckinDraft,
    setPostCheckinDraft,
    reportHistory,
    reportHistoryStatus,
    reportHistoryUpdatedAt,
    deloadSuggestions,
    currentExerciseIdx,
    setCurrentExerciseIdx,
    deleteConfirmIdx,
    editExerciseOpen,
    setEditExerciseOpen,
    editExerciseIdx,
    setEditExerciseIdx,
    editExerciseDraft,
    setEditExerciseDraft,
    editExerciseHasChanges,
    persistToPlan,
    setPersistToPlan,
    linkedWeightExercises,
    toggleLinkWeights,

    // Refs
    restPauseRefs,
    clusterRefs,
    restPauseDraftsRef,
    dropSetDraftsRef,
    organizeBaseKeysRef,
    reportHistoryLoadingRef,
    reportHistoryLoadingSinceRef,
    reportHistoryStatusRef,
    reportHistoryUpdatedAtRef,
    deloadAiCacheRef,
    postCheckinResolveRef,

    // Methods
    getLog,
    updateLog,
    updateSetType,
    getPlanConfig,
    getPlannedSet,
    toggleCollapse,
    addExtraSetToExercise,
    removeExtraSetFromExercise,
    openEditExercise,
    saveEditExercise,
    swapExerciseName,
    addExtraExerciseToWorkout,
    openOrganizeModal,
    requestCloseOrganize,
    saveOrganize,
    openDeleteConfirm,
    closeDeleteConfirm,
    removeExerciseFromWorkout,
    fullEditorOpen,
    fullEditorWorkout,
    setFullEditorWorkout,
    openFullEditor,
    closeFullEditor,
    saveFullEditor,
    finishWorkout,
    openDeloadModal,
    startTimer,
    handleTimerFinish,
    saveClusterModal,
    saveRestPauseModal,
    saveDropSetModal,
    saveStrippingModal,
    saveFst7Modal,
    saveHeavyDutyModal,
    savePontoZeroModal,
    saveForcedRepsModal,
    saveNegativeRepsModal,
    savePartialRepsModal,
    saveSistema21Modal,
    saveWaveModal,
    saveGroupMethodModal,
    applyDeloadToExercise,
    updateDeloadModalFromPercent,
    updateDeloadModalFromWeight,
    toggleNotes,
    alert,
    confirm,
    HELP_TERMS,
    currentExercise,
    onFinish: props.onFinish,
    sendInvite,
    completedSets,
    totalSets,
    progressPct,
    remainingSets,
    currentExSetsCount,
    currentExDoneSets,
  }), [
    session, anyModalOpen, workout, exercises, ui, settings,
    collapsed, setCollapsed, finishing,
    openNotesKeys, setOpenNotesKeys,
    inviteOpen, setInviteOpen,
    addExerciseOpen, setAddExerciseOpen, addExerciseDraft, setAddExerciseDraft,
    fullEditorOpen, fullEditorWorkout,
    organizeOpen, setOrganizeOpen, organizeDraft, setOrganizeDraft,
    organizeSaving, organizeDirty, organizeError, setOrganizeError,
    deloadModal, setDeloadModal,
    clusterModal, setClusterModal,
    restPauseModal, setRestPauseModal,
    dropSetModal, setDropSetModal,
    strippingModal, setStrippingModal,
    fst7Modal, setFst7Modal,
    heavyDutyModal, setHeavyDutyModal,
    pontoZeroModal, setPontoZeroModal,
    forcedRepsModal, setForcedRepsModal,
    negativeRepsModal, setNegativeRepsModal,
    partialRepsModal, setPartialRepsModal,
    sistema21Modal, setSistema21Modal,
    waveModal, setWaveModal,
    groupMethodModal, setGroupMethodModal,
    postCheckinOpen, setPostCheckinOpen, postCheckinDraft, setPostCheckinDraft,
    reportHistory, reportHistoryStatus, reportHistoryUpdatedAt,
    deloadSuggestions,
    currentExerciseIdx, setCurrentExerciseIdx,
    editExerciseOpen, setEditExerciseOpen,
    editExerciseIdx, setEditExerciseIdx,
    editExerciseDraft, setEditExerciseDraft, editExerciseHasChanges,
    persistToPlan, setPersistToPlan,
    linkedWeightExercises, toggleLinkWeights,
    restPauseRefs, clusterRefs, restPauseDraftsRef, dropSetDraftsRef, organizeBaseKeysRef,
    reportHistoryLoadingRef, reportHistoryLoadingSinceRef,
    reportHistoryStatusRef, reportHistoryUpdatedAtRef,
    deloadAiCacheRef, postCheckinResolveRef,
    getLog, updateLog, updateSetType,
    // getPlanConfig, getPlannedSet, HELP_TERMS são imports — referência estável,
    // não precisam estar nas deps. Listados no return acima como conveniência da API.
    toggleCollapse, addExtraSetToExercise, removeExtraSetFromExercise,
    openEditExercise, saveEditExercise, swapExerciseName, addExtraExerciseToWorkout,
    openOrganizeModal, requestCloseOrganize, saveOrganize,
    openDeleteConfirm, closeDeleteConfirm, removeExerciseFromWorkout, deleteConfirmIdx,
    openFullEditor, closeFullEditor, saveFullEditor, setFullEditorWorkout,
    finishWorkout, openDeloadModal, startTimer, handleTimerFinish,
    saveClusterModal, saveRestPauseModal, saveDropSetModal, saveStrippingModal,
    saveFst7Modal, saveHeavyDutyModal, savePontoZeroModal,
    saveForcedRepsModal, saveNegativeRepsModal, savePartialRepsModal,
    saveSistema21Modal, saveWaveModal, saveGroupMethodModal,
    applyDeloadToExercise, updateDeloadModalFromPercent, updateDeloadModalFromWeight,
    toggleNotes, alert, confirm,
    currentExercise, props.onFinish, sendInvite,
    completedSets, totalSets, progressPct, remainingSets,
    currentExSetsCount, currentExDoneSets,
  ]);

  // `logs` sai do value principal e vem à parte: ActiveWorkout injeta no WorkoutLogsContext.
  return { value, logs };
}
