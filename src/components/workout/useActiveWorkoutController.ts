
import { useCallback, useMemo, useRef } from 'react';
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
  WorkoutSession,
  WorkoutDraft,
  WorkoutSetDetail,
  ReportHistory,
  ReportHistoryItem,
  AiRecommendation,
  DeloadSetEntries,
  DeloadSetSuggestion,
  DeloadAnalysis,
  DeloadSuggestion
} from './types';
import {
  isObject,
  isClusterConfig,
  isRestPauseConfig,
  buildPlannedBlocks,
  buildBlocksByCount,
  toNumber,
  safeJsonParse,
  toDateMs,
  averageNumbers,
  extractLogWeight,
  withTimeout,
  normalizeReportHistory,
  readReportCache,
  writeReportCache,
  clampNumber,
  roundToStep,
  normalizeExerciseKey,
  estimate1Rm,
  DELOAD_HISTORY_KEY,
  DELOAD_AUDIT_KEY,
  DELOAD_HISTORY_SIZE,
  DELOAD_HISTORY_MIN,
  DELOAD_RECENT_WINDOW,
  DELOAD_STAGNATION_PCT,
  DELOAD_REGRESSION_PCT,
  DELOAD_REDUCTION_STABLE,
  DELOAD_REDUCTION_STAGNATION,
  DELOAD_REDUCTION_OVERTRAIN,
  DELOAD_MIN_1RM_FACTOR,
  DELOAD_REDUCTION_MIN,
  DELOAD_REDUCTION_MAX,
  WEIGHT_ROUND_STEP,
  REPORT_HISTORY_LIMIT,
  REPORT_CACHE_KEY,
  REPORT_CACHE_TTL_MS,
  REPORT_FETCH_TIMEOUT_MS,
  DELOAD_SUGGEST_MODE,
  DEFAULT_SUGGESTED_RPE,
  AI_SUGGESTION_MIN_HISTORY,
  AI_SUGGESTION_TIMEOUT_MS,
  DROPSET_STAGE_LIMIT
} from './utils';
import {
  getPlanConfig,
  getPlannedSet,
  normalizeNaturalNote,
  collectExerciseSetInputs,
  collectExercisePlannedInputs,
} from './helpers/setPlanningHelpers';
import {
  loadDeloadHistory,
  saveDeloadHistory,
  appendDeloadAudit,
  analyzeDeloadHistory,
  parseAiRecommendation,
  estimate1RmFromSets,
  getDeloadReason,
} from './helpers/deloadHelpers';
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
  };
  const sendInvite = teamWorkout.sendInvite;
  const broadcastMyLog = teamWorkout.broadcastMyLog
  const broadcastWorkoutEdit = teamWorkout.broadcastWorkoutEdit
  const teamSession = teamWorkout.teamSession
  const sharedLogs = teamWorkout.sharedLogs
  const session = props.session;
  const workout = session?.workout ?? null;
  const workoutExercises = workout?.exercises;
  const exercises = useMemo<WorkoutExercise[]>(() => (Array.isArray(workoutExercises) ? workoutExercises : []), [workoutExercises]);

  const logs: Record<string, unknown> = (session?.logs ?? {}) as Record<string, unknown>;
  // ── logsRef: always reflects the LATEST logs, even before React re-renders.
  // This prevents the stale-closure race condition where a rapid sequence of
  // updateLog calls (e.g., RPE input → OK click) causes the second call to
  // read a stale `prev` that was captured before the first update propagated,
  // erasing the user's typed values.
  const logsRef = useRef<Record<string, unknown>>(logs);
  logsRef.current = logs; // synchronous — always current
  const ui: UnknownRecord = (session?.ui ?? {}) as UnknownRecord;
  const settings = props.settings ?? null;

  type PostCheckinDraft = { rpe: string; satisfaction: string; soreness: string; notes: string };
  type ReportHistoryStatus = { status: 'idle' | 'loading' | 'ready' | 'error'; error: string; source: string };
  type InputRefMap = Record<string, Array<HTMLInputElement | null>>;

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


  const MAX_EXTRA_SETS_PER_EXERCISE = 50;
  const MAX_EXTRA_EXERCISES_PER_SETS_PER_EXERCISE = 50;
  const MAX_EXTRA_EXERCISES_PER_WORKOUT = 50;
  const DEFAULT_EXTRA_EXERCISE_REST_TIME_S = 60;


  const getLog = (key: string): UnknownRecord => {
    const v = logsRef.current[key];
    return isObject(v) ? v : {};
  };

  const updateLog = (key: string, patch: unknown) => {
    try {
      if (typeof props?.onUpdateLog !== 'function') return;

      const patchObj: UnknownRecord = isObject(patch) ? patch : {};
      const [exIdxStr, sIdxStr] = key.split('-');
      const exIdx = parseInt(exIdxStr, 10);
      const sIdx = parseInt(sIdxStr, 10);

      // Haptic feedback when completing a set
      if (patchObj.done === true) {
        try { navigator?.vibrate?.(50) } catch { /* not supported */ }
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
            props.onUpdateLog(linkedKey, { ...prev, ...patchObj });
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
      props.onUpdateLog(key, { ...prev, ...patchObj });

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
  };


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
    buildExerciseHistoryEntry, persistDeloadHistoryFromSession,
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
    addExtraExerciseToWorkout,
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
  const { finishWorkout, requestPostWorkoutCheckin } = finishHook;



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
