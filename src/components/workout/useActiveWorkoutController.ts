
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { logError } from '@/lib/logger';
import { useWorkoutTicker } from './hooks/useWorkoutTicker';
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
  WorkoutExercise,
} from './types';
import { isObject } from './utils';
import {
  getPlanConfig,
  getPlannedSet,
} from './helpers/setPlanningHelpers';
import { HELP_TERMS } from '@/utils/help/terms';

const parseStartedAtMs = (raw: unknown): number => {
  const direct = typeof raw === 'number' ? raw : Number(String(raw ?? '').trim())
  if (Number.isFinite(direct) && direct > 0) return direct
  try {
    const d = new Date(String(raw ?? ''))
    const t = d.getTime()
    return Number.isFinite(t) ? t : 0
  } catch {
    return 0
  }
}

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
  const logsRef = useRef<Record<string, unknown>>(logs);
  logsRef.current = logs; // synchronous — always current
  // propsRef: stable reference to latest props so callbacks can access them without rebuilding
  const propsRef = useRef(props);
  propsRef.current = props;
  const ui: UnknownRecord = (session?.ui ?? {}) as UnknownRecord;
  const settings = props.settings ?? null;

  const { ticker, timerMinimized, setTimerMinimized } = useWorkoutTicker();

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
    editExerciseOpen, setEditExerciseOpen,
    editExerciseIdx, setEditExerciseIdx,
    editExerciseDraft, setEditExerciseDraft,
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
        const sdArr: unknown[] = ex && Array.isArray(ex?.setDetails) ? (ex.setDetails as unknown[]) : ex && Array.isArray((ex as UnknownRecord)?.set_details) ? ((ex as UnknownRecord).set_details as unknown[]) : [];
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
            propsRef.current.onUpdateLog(linkedKey, { ...prev, ...patchObj });
          }
          // Broadcast linked weight update for first set only
          try {
            const w = String(patchObj.weight ?? '')
            if (broadcastMyLog && w) broadcastMyLog(exIdx, 0, w, String(patchObj.reps ?? getLog(`${exIdx}-0`)?.reps ?? ''))
          } catch { }
          return;
        }
      }

      const prev = getLog(key);
      propsRef.current.onUpdateLog(key, { ...prev, ...patchObj });

      // Broadcast log update to team partners
      try {
        if (broadcastMyLog && Number.isFinite(exIdx) && Number.isFinite(sIdx)) {
          const merged = { ...prev, ...patchObj }
          const w = String(merged.weight ?? '')
          const r = String(merged.reps ?? '')
          if (w || r) broadcastMyLog(exIdx, sIdx, w, r)
        }
      } catch { }
    } catch (e) { logError('hook:useActiveWorkoutController.updateLog', e) }
  }, [exercises, linkedWeightExercises, broadcastMyLog, getLog]);

  // ── Apply partner exercise control updates ───────────────────────────────
  const exerciseControlUpdates = teamWorkout.exerciseControlUpdates
  const lastAppliedUpdateTs = useRef(0)
  useEffect(() => {
    if (!exerciseControlUpdates?.length) return
    for (const update of exerciseControlUpdates) {
      if (update.ts <= lastAppliedUpdateTs.current) continue
      lastAppliedUpdateTs.current = update.ts
      const key = `${update.exerciseIdx}-${update.setIdx}`
      try {
        const prev = getLog(key)
        const merged = { ...prev, ...update.patch }
        if (typeof propsRef.current?.onUpdateLog === 'function') {
          propsRef.current.onUpdateLog(key, merged)
        }
      } catch (e) { logError('hook:useActiveWorkoutController.applyPartnerUpdate', e) }
    }
  }, [exerciseControlUpdates, getLog])


  // ── Deload + report history (extracted to useWorkoutDeload) ──────────────
  const deload = useWorkoutDeload({
    session, workout, exercises, logs, getLog, updateLog,
    getPlanConfig: (ex, setIdx) => getPlanConfig(ex, setIdx),
    getPlannedSet: (ex, setIdx) => getPlannedSet(ex, setIdx),
    ticker, alert: alertVoid, confirm,
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


  const startTimer = (seconds: unknown, context: unknown) => {
    try {
      if (typeof props?.onStartTimer !== 'function') return;
      const s = Number(seconds);
      if (!Number.isFinite(s) || s <= 0) return;
      // Auto-inject exerciseName from key ("exIdx-setIdx") if not already provided
      const ctx = isObject(context) ? { ...(context as Record<string, unknown>) } : {};
      if (!ctx.exerciseName) {
        const key = String(ctx.key || '').trim();
        const exIdx = key ? Number(key.split('-')[0]) : NaN;
        if (Number.isFinite(exIdx) && exIdx >= 0 && exercises[exIdx]) {
          ctx.exerciseName = String(exercises[exIdx]?.name || '').trim() || undefined;
        }
      }
      props.onStartTimer(s, ctx);
    } catch { }
  };

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
    editExerciseIdx, setEditExerciseIdx,
    editExerciseOpen, setEditExerciseOpen,
    addExerciseDraft, setAddExerciseDraft,
    addExerciseOpen, setAddExerciseOpen,
    organizeDraft, setOrganizeDraft,
    organizeSaving, setOrganizeSaving,
    organizeError, setOrganizeError,
    organizeOpen, setOrganizeOpen,
    organizeDirty, organizeBaseKeysRef: organizeBaseKeysRef as unknown as React.MutableRefObject<string>,
    onUpdateSession: (updatedWorkout: UnknownRecord) => {
      props.onUpdateSession?.(updatedWorkout);
      if (teamSession?.id && typeof broadcastWorkoutEdit === 'function') {
        // Small delay to allow state to settle before serialising
        setTimeout(() => {
          try { broadcastWorkoutEdit(updatedWorkout); } catch { }
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
  });

  // ── Toggle exercise notes ──────────────────────────────────────────────
  const toggleNotes = (key: string) => {
    setOpenNotesKeys((prev: Set<string>) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };


  // ── Finish workout (extracted to useWorkoutFinish) ──────────────────────
  const finishHook = useWorkoutFinish({
    session, workout, exercises, logs, ui,
    userId: String((settings as Record<string, unknown>)?.userId ?? (session as Record<string, unknown>)?.userId ?? ''),
    settings, ticker,
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

  const elapsedSeconds = useMemo(() => {
    const startedAtMs = parseStartedAtMs(session?.startedAt);
    return startedAtMs > 0 ? Math.max(0, Math.floor((ticker - startedAtMs) / 1000)) : 0;
  }, [session?.startedAt, ticker]);

  const formatElapsed = (sec: unknown) => {
    const s = Number(sec) || 0;
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${r < 10 ? '0' : ''}${r}`;
  };

  // ── Centralized progress calculation (single source of truth) ───────────
  const { completedSets, totalSets, progressPct, remainingSets } = useMemo(() => {
    let total = 0;
    let done = 0;
    exercises.forEach((ex, exIdx) => {
      const setsHeader = Math.max(0, parseInt(String(ex?.sets ?? '0'), 10) || 0);
      const sdArr = Array.isArray(ex?.setDetails) ? ex.setDetails : Array.isArray((ex as Record<string, unknown>)?.set_details) ? (ex as Record<string, unknown>).set_details as unknown[] : [];
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

  return {
    session,
    workout,
    exercises,
    logs,
    ui,
    settings,
    ticker,
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
    timerMinimized,
    setTimerMinimized,
    currentExerciseIdx,
    setCurrentExerciseIdx,
    editExerciseOpen,
    setEditExerciseOpen,
    editExerciseIdx,
    setEditExerciseIdx,
    editExerciseDraft,
    setEditExerciseDraft,
    linkedWeightExercises,
    toggleLinkWeights,

    // Refs
    restPauseRefs,
    clusterRefs,
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
    elapsedSeconds,
    formatElapsed,
    onFinish: props.onFinish,
    sendInvite,
    completedSets,
    totalSets,
    progressPct,
    remainingSets,
  };
}
