
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWorkoutTicker } from './hooks/useWorkoutTicker';
import { useWorkoutModals } from './hooks/useWorkoutModals';
import { useWorkoutMethodSavers } from './hooks/useWorkoutMethodSavers';
import { useDialog } from '@/contexts/DialogContext';
import { useTeamWorkout } from '@/contexts/TeamWorkoutContext';
import { queueFinishWorkout, isOnline } from '@/lib/offline/offlineSync';
import { applyExerciseOrder, buildExerciseDraft, draftOrderKeys, moveDraftItem } from '@/lib/workoutReorder';
import { buildFinishWorkoutPayload } from '@/lib/finishWorkoutPayload';
import { generatePostWorkoutInsights } from '@/actions/workout-actions';
import { useStableSupabaseClient } from '@/hooks/useStableSupabaseClient';
import { parseTrainingNumber } from '@/utils/trainingNumber';
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
import { logError, logWarn, logInfo } from '@/lib/logger'

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
  const teamWorkout = useTeamWorkout() as unknown as {
    sendInvite: (targetUser: unknown, workout: UnknownRecord) => Promise<unknown>
    broadcastMyLog: (exIdx: number, sIdx: number, weight: string, reps: string) => void
    teamSession: { id: string; isHost: boolean; participants: unknown[] } | null
    sharedLogs: Record<string, Record<string, { exIdx: number; sIdx: number; weight: string; reps: string; ts: number }>>
  };
  const sendInvite = teamWorkout.sendInvite;
  const broadcastMyLog = teamWorkout.broadcastMyLog
  const teamSession = teamWorkout.teamSession
  const sharedLogs = teamWorkout.sharedLogs
  const session = props.session;
  const workout = session?.workout ?? null;
  const exercises = useMemo<WorkoutExercise[]>(() => (Array.isArray(workout?.exercises) ? workout.exercises : []), [workout?.exercises]);
  const logs: Record<string, unknown> = (session?.logs ?? {}) as Record<string, unknown>;
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
    restPauseRefs,
    clusterRefs,
  } = useWorkoutModals(collapsedKey);


  const MAX_EXTRA_SETS_PER_EXERCISE = 50;
  const MAX_EXTRA_EXERCISES_PER_SETS_PER_EXERCISE = 50;
  const MAX_EXTRA_EXERCISES_PER_WORKOUT = 50;
  const DEFAULT_EXTRA_EXERCISE_REST_TIME_S = 60;

  // Report history state — kept here because deload engine depends on it deeply
  const [reportHistory, setReportHistory] = useState<ReportHistory>({ version: 1, exercises: {} });
  const [reportHistoryStatus, setReportHistoryStatus] = useState<ReportHistoryStatus>({ status: 'idle', error: '', source: '' });
  const [reportHistoryUpdatedAt, setReportHistoryUpdatedAt] = useState<number>(0);
  const [deloadSuggestions, setDeloadSuggestions] = useState<Record<string, unknown>>({});

  const reportHistoryLoadingRef = useRef<boolean>(false);
  const reportHistoryLoadingSinceRef = useRef<number>(0);
  const reportHistoryStatusRef = useRef<ReportHistoryStatus>({ status: 'idle', error: '', source: '' });
  const reportHistoryUpdatedAtRef = useRef<number>(0);
  const deloadAiCacheRef = useRef<Record<string, unknown>>({});
  const supabase = useStableSupabaseClient();

  useEffect(() => {
    reportHistoryStatusRef.current = reportHistoryStatus && typeof reportHistoryStatus === 'object' ? reportHistoryStatus : { status: 'idle', error: '', source: '' };
  }, [reportHistoryStatus]);

  useEffect(() => {
    reportHistoryUpdatedAtRef.current = Number(reportHistoryUpdatedAt || 0);
  }, [reportHistoryUpdatedAt]);


  const getLog = (key: string): UnknownRecord => {
    const v = logs[key];
    return isObject(v) ? v : {};
  };

  const updateLog = (key: string, patch: unknown) => {
    try {
      if (typeof props?.onUpdateLog !== 'function') return;

      const patchObj: UnknownRecord = isObject(patch) ? patch : {};
      const [exIdxStr, sIdxStr] = key.split('-');
      const exIdx = parseInt(exIdxStr, 10);
      const sIdx = parseInt(sIdxStr, 10);

      // If weight changes and this exercise has linked weights enable, update all sets
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
    } catch { }
  };

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


  const buildExerciseHistoryEntryFromSessionLogs = useCallback(
    (sessionObj: unknown, exIdx: number, meta: UnknownRecord): ReportHistoryItem | null => {
      try {
        const base = isObject(sessionObj) ? sessionObj : null;
        if (!base) return null;
        const logsObj: UnknownRecord = isObject(base.logs) ? (base.logs as UnknownRecord) : {};
        const sets: Array<{ weight: number | null; reps: number | null }> = [];
        Object.entries(logsObj).forEach(([key, value]) => {
          try {
            const parts = String(key || '').split('-');
            const eIdx = Number(parts[0]);
            if (!Number.isFinite(eIdx) || eIdx !== exIdx) return;
            const log = isObject(value) ? value : null;
            if (!log) return;
            const weight = extractLogWeight(log);
            const reps = toNumber(log.reps ?? null);
            const hasValues = weight != null || reps != null;
            const doneRaw = log.done ?? log.isDone ?? log.completed ?? null;
            const done = doneRaw == null ? true : doneRaw === true || String(doneRaw || '').toLowerCase() === 'true';
            if (!done && !hasValues) return;
            if (hasValues) {
              sets.push({ weight, reps });
            }
          } catch { }
        });
        if (!sets.length) return null;
        const weightList = sets
          .map((s) => s.weight)
          .filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0);
        const repsList = sets
          .map((s) => s.reps)
          .filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0);
        const avgWeight = averageNumbers(weightList);
        const avgReps = averageNumbers(repsList);
        const totalVolume = sets.reduce((acc, s) => {
          const w = Number(s.weight ?? 0);
          const r = Number(s.reps ?? 0);
          if (!Number.isFinite(w) || !Number.isFinite(r)) return acc;
          if (w <= 0 || r <= 0) return acc;
          return acc + w * r;
        }, 0);
        const topWeight = weightList.length ? Math.max(...weightList) : null;
        if (!avgWeight && !avgReps && !totalVolume) return null;
        const ts =
          toDateMs(base.date) ??
          toDateMs(base.completed_at) ??
          toDateMs(base.completedAt) ??
          toDateMs(meta.date) ??
          toDateMs(meta.created_at) ??
          Date.now();
        return {
          ts,
          avgWeight: avgWeight ?? null,
          avgReps: avgReps ?? null,
          totalVolume: Number.isFinite(totalVolume) ? totalVolume : 0,
          topWeight,
          setsCount: sets.length,
        };
      } catch {
        return null;
      }
    },
    [],
  );

  const buildReportHistoryFromWorkouts = useCallback(
    (rows: unknown): ReportHistory => {
      try {
        const list: unknown[] = Array.isArray(rows) ? rows : [];
        const next: ReportHistory = { version: 1, exercises: {} };
        list.forEach((row) => {
          const rowObj = isObject(row) ? row : null;
          if (!rowObj) return;
          const sessionObj = safeJsonParse(rowObj.notes);
          if (!isObject(sessionObj)) return;
          const rawExercises = (sessionObj as UnknownRecord).exercises;
          const exercisesArr: unknown[] = Array.isArray(rawExercises) ? rawExercises : [];
          if (!exercisesArr.length) return;
          exercisesArr.forEach((ex, exIdx) => {
            const exObj = isObject(ex) ? ex : null;
            const name = String(exObj?.name || '').trim();
            if (!name) return;
            const key = normalizeExerciseKey(name);
            if (!key) return;
            const entry = buildExerciseHistoryEntryFromSessionLogs(sessionObj, exIdx, rowObj);
            if (!entry) return;
            const prev = next.exercises[key] ?? { name, items: [] };
            next.exercises[key] = { name, items: [...prev.items, { ...entry, name }] };
          });
        });
        Object.keys(next.exercises).forEach((key) => {
          const ex = next.exercises[key];
          const items: ReportHistoryItem[] = Array.isArray(ex?.items) ? ex.items : [];
          const ordered = items
            .filter((it): it is ReportHistoryItem => !!it && typeof it.ts === 'number')
            .sort((a, b) => Number(a.ts || 0) - Number(b.ts || 0))
            .slice(-DELOAD_HISTORY_SIZE);
          next.exercises[key] = { ...ex, items: ordered };
        });
        return next;
      } catch {
        return { version: 1, exercises: {} };
      }
    },
    [buildExerciseHistoryEntryFromSessionLogs],
  );

  useEffect(() => {
    let cancelled = false;
    let loadingTimeoutId: ReturnType<typeof setTimeout> | null = null;
    const cached = readReportCache();
    if (cached?.data && !cancelled) {
      setReportHistory(cached.data);
      setReportHistoryUpdatedAt(cached.cachedAt);
      setReportHistoryStatus({ status: 'ready', error: '', source: cached.stale ? 'cache-stale' : 'cache' });
      reportHistoryLoadingSinceRef.current = 0;
    }
    (async () => {
      try {
        if (!supabase) {
          if (!cached?.data && !cancelled) {
            setReportHistoryStatus((prev) => ({ status: 'error', error: 'Supabase indisponível', source: prev?.source || '' }));
            setReportHistoryUpdatedAt((prev) => (prev ? prev : Date.now()));
          }
          return;
        }
        if (reportHistoryLoadingRef.current) return;
        if (cached?.data && !cached.stale) return;
        reportHistoryLoadingRef.current = true;
        reportHistoryLoadingSinceRef.current = Date.now();
        if (!cancelled) setReportHistoryStatus((prev) => ({ status: 'loading', error: '', source: prev?.source || '' }));
        loadingTimeoutId = setTimeout(() => {
          if (cancelled) return;
          if (reportHistoryLoadingRef.current) {
            reportHistoryLoadingRef.current = false;
            reportHistoryLoadingSinceRef.current = 0;
            setReportHistoryStatus((prev) => (prev?.status === 'loading' ? { status: 'error', error: 'Tempo limite ao carregar relatórios', source: prev?.source || '' } : prev));
            setReportHistoryUpdatedAt((prev) => (prev ? prev : Date.now()));
          }
        }, REPORT_FETCH_TIMEOUT_MS + 1500);
        const { data } = await withTimeout(supabase.auth.getUser(), REPORT_FETCH_TIMEOUT_MS);
        const userId = data?.user?.id ? String(data.user.id) : '';
        if (!userId) {
          if (!cancelled) setReportHistoryStatus((prev) => ({ status: 'error', error: 'Usuário indisponível', source: prev?.source || '' }));
          if (!cancelled) setReportHistoryUpdatedAt((prev) => (prev ? prev : Date.now()));
          return;
        }
        const { data: rows, error } = await withTimeout(
          supabase
            .from('workouts')
            .select('id, notes, date, created_at')
            .eq('user_id', userId)
            .eq('is_template', false)
            .order('date', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(REPORT_HISTORY_LIMIT),
          REPORT_FETCH_TIMEOUT_MS
        );
        if (error) throw error;
        const next = buildReportHistoryFromWorkouts(rows);
        if (!cancelled) {
          setReportHistory(next);
          setReportHistoryUpdatedAt(Date.now());
          setReportHistoryStatus({ status: 'ready', error: '', source: 'network' });
          writeReportCache(next);
        }
      } catch {
        if (!cancelled) {
          setReportHistoryStatus((prev) => ({ status: 'error', error: 'Falha ao carregar relatórios', source: prev?.source || '' }));
          setReportHistoryUpdatedAt((prev) => (prev ? prev : Date.now()));
        }
      } finally {
        if (loadingTimeoutId) clearTimeout(loadingTimeoutId);
        reportHistoryLoadingRef.current = false;
        reportHistoryLoadingSinceRef.current = 0;
      }
    })();
    return () => {
      cancelled = true;
      if (loadingTimeoutId) clearTimeout(loadingTimeoutId);
    };
  }, [supabase, buildReportHistoryFromWorkouts]);

  useEffect(() => {
    try {
      const statusObj = reportHistoryStatusRef.current && typeof reportHistoryStatusRef.current === 'object' ? reportHistoryStatusRef.current : { status: 'idle' };
      const status = String(statusObj?.status || 'idle');
      const updatedAt = Number(reportHistoryUpdatedAtRef.current || 0);
      const since = Number(reportHistoryLoadingSinceRef.current || 0);
      if (status !== 'loading' || updatedAt) return;
      if (!since) return;
      const elapsed = Date.now() - since;
      const max = REPORT_FETCH_TIMEOUT_MS + 2000;
      if (elapsed <= max) return;
      reportHistoryLoadingRef.current = false;
      reportHistoryLoadingSinceRef.current = 0;
      setReportHistoryStatus((prev) =>
        prev?.status === 'loading'
          ? { status: 'error', error: 'Tempo limite ao carregar relatórios', source: prev?.source || '' }
          : prev,
      );
      setReportHistoryUpdatedAt((prev) => (prev ? prev : Date.now()));
    } catch { }
  }, [ticker]);




  const buildExerciseHistoryEntry = (ex: WorkoutExercise, exIdx: number): ReportHistoryItem | null => {
    const { sets } = collectExerciseSetInputs(ex, exIdx, getLog);
    if (!sets.length) return null;
    const weightList = sets.map((s) => s.weight).filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0);
    const repsList = sets.map((s) => s.reps).filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0);
    const avgWeight = averageNumbers(weightList);
    const avgReps = averageNumbers(repsList);
    const totalVolume = sets.reduce((acc, s) => {
      const w = Number(s.weight ?? 0);
      const r = Number(s.reps ?? 0);
      if (!Number.isFinite(w) || !Number.isFinite(r)) return acc;
      if (w <= 0 || r <= 0) return acc;
      return acc + w * r;
    }, 0);
    const topWeight = weightList.length ? Math.max(...weightList) : null;
    if (!avgWeight && !avgReps && !totalVolume) return null;
    return {
      ts: Date.now(),
      avgWeight: avgWeight ?? null,
      avgReps: avgReps ?? null,
      totalVolume: Number.isFinite(totalVolume) ? totalVolume : 0,
      topWeight: topWeight ?? null,
      setsCount: sets.length,
    };
  };

  const persistDeloadHistoryFromSession = () => {
    try {
      const history = loadDeloadHistory();
      const next = { version: 1, ...(history && typeof history === 'object' ? history : {}), exercises: { ...(history?.exercises || {}) } };
      const list = Array.isArray(exercises) ? exercises : [];
      list.forEach((ex, exIdx) => {
        const name = String(ex?.name || '').trim();
        if (!name) return;
        const key = normalizeExerciseKey(name);
        const entry = buildExerciseHistoryEntry(ex, exIdx);
        if (!entry) return;
        const prev = next.exercises?.[key] && typeof next.exercises[key] === 'object' ? next.exercises[key] : { name, items: [] };
        const items = Array.isArray(prev?.items) ? prev.items : [];
        const updated = [...items, { ...entry, name }].slice(-DELOAD_HISTORY_SIZE);
        next.exercises[key] = { name, items: updated };
      });
      saveDeloadHistory(next);
    } catch { }
  };




  const buildDeloadSuggestion = (ex: WorkoutExercise, exIdx: number, aiSuggestion: AiRecommendation | null = null): DeloadSuggestion => {
    const name = String(ex?.name || '').trim() || `Exercício ${exIdx + 1}`;
    const key = normalizeExerciseKey(name);
    const history = loadDeloadHistory();
    const items = history.exercises[key]?.items ?? [];
    const reportItems = reportHistory.exercises[key]?.items ?? [];
    const preferredItems: ReportHistoryItem[] = reportItems.length ? reportItems : items;
    const currentInputs = collectExerciseSetInputs(ex, exIdx, getLog);
    const currentSets = currentInputs.sets;
    const historyCount = preferredItems.length ? preferredItems.length : currentSets.length ? 1 : 0;
    const plannedInputs = collectExercisePlannedInputs(ex, exIdx);
    const plannedSets = plannedInputs.sets;
    const baseWeightFromHistory = averageNumbers(preferredItems.map((i) => i.avgWeight).filter((v) => typeof v === 'number' && Number.isFinite(v) && v > 0));
    const baseWeightFromCurrent = averageNumbers(currentSets.map((s) => s.weight).filter((v) => typeof v === 'number' && Number.isFinite(v) && v > 0));
    const baseWeightFromPlan = averageNumbers(plannedSets.map((s) => s.weight).filter((v) => typeof v === 'number' && Number.isFinite(v) && v > 0));
    const baseWeightFromAi = aiSuggestion?.weight != null && aiSuggestion.weight > 0 ? aiSuggestion.weight : null;
    const baseWeight = baseWeightFromHistory ?? baseWeightFromCurrent ?? baseWeightFromPlan ?? baseWeightFromAi ?? null;
    if (!baseWeight || !Number.isFinite(Number(baseWeight)) || Number(baseWeight) <= 0) {
      return { ok: false, error: 'Deload indisponível: sem carga no relatório nem no plano.' };
    }
    const analysis = analyzeDeloadHistory(preferredItems);
    const targetReduction =
      analysis.status === 'overtraining'
        ? DELOAD_REDUCTION_OVERTRAIN
        : analysis.status === 'stagnation'
          ? DELOAD_REDUCTION_STAGNATION
          : DELOAD_REDUCTION_STABLE;
    const estSourceSets = baseWeightFromHistory ? [] : baseWeightFromCurrent ? currentSets : baseWeightFromPlan ? plannedSets : [];
    const est1rm = estimate1RmFromSets(estSourceSets, preferredItems);
    const minWeight = est1rm ? est1rm * DELOAD_MIN_1RM_FACTOR : 0;
    const rawSuggested = baseWeight * (1 - targetReduction);
    const suggestedWeight = roundToStep(Math.max(rawSuggested, minWeight || 0), WEIGHT_ROUND_STEP);
    const appliedReduction = baseWeight > 0 ? clampNumber(1 - suggestedWeight / baseWeight, 0, 1) : targetReduction;
    const result: DeloadSuggestion = {
      ok: true,
      name,
      exIdx,
      baseWeight,
      suggestedWeight,
      appliedReduction,
      targetReduction,
      historyCount,
      minWeight,
      analysis,
    };
    return result;
  };


  const resolveAiSuggestionForExercise = async (exerciseName: unknown): Promise<AiRecommendation | null> => {
    try {
      const name = String(exerciseName || '').trim();
      if (!name) return null;
      const key = normalizeExerciseKey(name);
      const cache: Record<string, AiRecommendation | null | undefined> = isObject(deloadAiCacheRef.current) ? (deloadAiCacheRef.current as Record<string, AiRecommendation | null | undefined>) : {};
      if (cache[key] !== undefined) return cache[key] ?? null;
      if (!session) {
        deloadAiCacheRef.current = { ...cache, [key]: null } as Record<string, unknown>;
        return null;
      }
      const res = await withTimeout(
        generatePostWorkoutInsights({
          workoutId: typeof session?.id === 'string' ? session.id : null,
          session,
        }),
        AI_SUGGESTION_TIMEOUT_MS,
      );
      const resObj = isObject(res) ? (res as UnknownRecord) : null;
      if (!resObj?.ok || !isObject(resObj.ai)) {
        deloadAiCacheRef.current = { ...cache, [key]: null } as Record<string, unknown>;
        return null;
      }
      const aiObj = resObj.ai as UnknownRecord;
      const progressionRaw = aiObj.progression;
      const progression: unknown[] = Array.isArray(progressionRaw) ? progressionRaw : [];
      const match = progression.find((rec) => (isObject(rec) ? normalizeExerciseKey((rec as UnknownRecord).exercise || '') === key : false));
      const matchObj = isObject(match) ? (match as UnknownRecord) : null;
      const parsed = parseAiRecommendation(matchObj?.recommendation ?? '');
      const ai = { weight: parsed.weight ?? null, reps: parsed.reps ?? null, rpe: parsed.rpe ?? null };
      deloadAiCacheRef.current = { ...cache, [key]: ai } as Record<string, unknown>;
      return ai;
    } catch (err: unknown) {
      return null;
    }
  };

  const buildDeloadSetSuggestions = (ex: WorkoutExercise, exIdx: number): DeloadSetSuggestion => {
    try {
      const name = String(ex?.name || '').trim() || `Exercício ${exIdx + 1}`;
      const key = normalizeExerciseKey(name);
      const history = loadDeloadHistory();
      const items = history.exercises[key]?.items ?? [];
      const reportItems = reportHistory.exercises[key]?.items ?? [];
      const preferredItems: ReportHistoryItem[] = reportItems.length ? reportItems : items;
      const ordered = preferredItems.slice().sort((a, b) => Number(a.ts || 0) - Number(b.ts || 0));
      const latest = ordered.length ? ordered[ordered.length - 1] : null;
      const latestAvgWeight = toNumber(latest?.avgWeight ?? null);
      const latestAvgReps = toNumber(latest?.avgReps ?? null);
      const baseSuggestion = buildDeloadSuggestion(ex, exIdx);
      const baseWeight = baseSuggestion.ok ? baseSuggestion.baseWeight : latestAvgWeight ?? null;
      const suggestedWeight = baseSuggestion.ok ? baseSuggestion.suggestedWeight : baseWeight ?? null;
      const minWeight = baseSuggestion.ok ? baseSuggestion.minWeight : 0;
      const ratio = baseWeight && suggestedWeight ? suggestedWeight / baseWeight : 1;
      const { setsCount } = collectExerciseSetInputs(ex, exIdx, getLog);
      const entries: DeloadSetEntries = {};
      for (let setIdx = 0; setIdx < setsCount; setIdx += 1) {
        const setKey = `${exIdx}-${setIdx}`;
        const log = getLog(setKey);
        const cfg = getPlanConfig(ex, setIdx);
        const planned = getPlannedSet(ex, setIdx);
        const baseSetWeight = extractLogWeight(log) ?? toNumber(cfg?.weight ?? planned?.weight ?? baseWeight ?? latestAvgWeight ?? null);
        const nextWeight = baseSetWeight ? roundToStep(Math.max(baseSetWeight * ratio, minWeight || 0), WEIGHT_ROUND_STEP) : null;
        const repsBase = toNumber(planned?.reps ?? ex?.reps ?? latestAvgReps ?? null);
        const rpeBase = toNumber(planned?.rpe ?? ex?.rpe ?? null);
        const nextRpe = rpeBase != null ? rpeBase : (nextWeight || repsBase ? DEFAULT_SUGGESTED_RPE : null);
        const hasSuggestion = nextWeight != null || repsBase != null || nextRpe != null;
        if (hasSuggestion) {
          entries[setKey] = { weight: nextWeight ?? null, reps: repsBase ?? null, rpe: nextRpe ?? null };
        }
      }
      const hasEntries = Object.keys(entries).length > 0;
      if (!hasEntries) {
        return { ok: false, error: '' };
      }
      const result: DeloadSetSuggestion = {
        ok: true,
        name,
        key,
        entries,
        itemsCount: preferredItems.length,
        baseSuggestion: baseSuggestion.ok ? baseSuggestion : null,
      };
      return result;
    } catch (e: unknown) {
      return { ok: false, error: 'Falha ao analisar histórico.' };
    }
  };

  const openDeloadModal = async (ex: WorkoutExercise, exIdx: number): Promise<void> => {
    const startedAt = Date.now();
    const totalTimeoutMs = REPORT_FETCH_TIMEOUT_MS + AI_SUGGESTION_TIMEOUT_MS + 3000;
    try {
      await withTimeout(
        (async () => {
          let ok = false;
          try {
            ok = typeof confirm === 'function'
              ? await confirm('Deseja analisar deload para este exercício?', 'Aplicar Deload', { confirmText: 'Analisar', cancelText: 'Cancelar' })
              : false;
          } catch {
            ok = false;
          }
          if (!ok) return;
          const safeEx: WorkoutExercise | null = isObject(ex) ? (ex as WorkoutExercise) : null;
          const safeIdx = Number(exIdx);
          if (!safeEx || !Number.isFinite(safeIdx) || safeIdx < 0) {
            try {
              await alert('Deload indisponível: exercício inválido.');
            } catch { }
            return;
          }
          const name = String(safeEx?.name || '').trim() || `Exercício ${safeIdx + 1}`;
          const { setsCount } = collectExerciseSetInputs(safeEx, safeIdx, getLog);
          if (!setsCount || setsCount <= 0) {
            try {
              await alert('Deload indisponível: exercício sem séries configuradas.');
            } catch { }
            return;
          }

          const statusSnap = reportHistoryStatusRef.current && typeof reportHistoryStatusRef.current === 'object' ? reportHistoryStatusRef.current : { status: 'idle' };
          const isStillLoading = String(statusSnap?.status || 'idle') === 'loading' && !Number(reportHistoryUpdatedAtRef.current || 0);
          if (reportHistoryLoadingRef.current || isStillLoading) {
            try {
              await new Promise((resolve, reject) => {
                const deadline = Date.now() + REPORT_FETCH_TIMEOUT_MS + 1500;
                const timer = setInterval(() => {
                  const st = reportHistoryStatusRef.current && typeof reportHistoryStatusRef.current === 'object' ? reportHistoryStatusRef.current : { status: 'idle' };
                  const upd = Number(reportHistoryUpdatedAtRef.current || 0);
                  const doneLoading = !reportHistoryLoadingRef.current && String(st?.status || 'idle') !== 'loading';
                  if (doneLoading || upd) {
                    clearInterval(timer);
                    resolve(true);
                    return;
                  }
                  if (Date.now() > deadline) {
                    clearInterval(timer);
                    reject(new Error('timeout'));
                  }
                }, 200);
              });
            } catch {
              if (reportHistoryLoadingRef.current) {
                reportHistoryLoadingRef.current = false;
                setReportHistoryStatus((prev) =>
                  prev?.status === 'loading'
                    ? { status: 'error', error: 'Tempo limite ao carregar relatórios', source: prev?.source || '' }
                    : prev,
                );
                setReportHistoryUpdatedAt((prev) => (prev ? prev : Date.now()));
              }
            }
          }
          const suggestionDraft = buildDeloadSetSuggestions(safeEx, safeIdx);
          let mergedEntries: DeloadSetEntries | null = suggestionDraft.ok ? { ...suggestionDraft.entries } : null;
          let aiSuggestion: AiRecommendation | null = null;
          if (suggestionDraft.ok && suggestionDraft.itemsCount >= AI_SUGGESTION_MIN_HISTORY) {
            aiSuggestion = await resolveAiSuggestionForExercise(suggestionDraft.name);
            const ai = aiSuggestion;
            if (ai && mergedEntries) {
              Object.keys(mergedEntries).forEach((k) => {
                const cur = mergedEntries![k];
                mergedEntries![k] = {
                  weight: ai.weight != null ? ai.weight : cur.weight ?? null,
                  reps: ai.reps != null ? ai.reps : cur.reps ?? null,
                  rpe: ai.rpe != null ? ai.rpe : cur.rpe ?? null,
                };
              });
            }
          }
          if (mergedEntries && Object.keys(mergedEntries).length) {
            setDeloadSuggestions((prev) => ({ ...(prev && typeof prev === 'object' ? prev : {}), ...mergedEntries }));
          }
          let suggestion = buildDeloadSuggestion(safeEx, safeIdx, aiSuggestion);
          if (!suggestion.ok) {
            const missingWeight = String((suggestion as Record<string, unknown>).error || '').toLowerCase().includes('sem carga');
            if (missingWeight && !aiSuggestion) {
              aiSuggestion = await resolveAiSuggestionForExercise(suggestionDraft.ok ? suggestionDraft.name : name);
              const ai = aiSuggestion;
              if (ai && mergedEntries) {
                Object.keys(mergedEntries).forEach((k) => {
                  const cur = mergedEntries![k];
                  mergedEntries![k] = {
                    weight: ai.weight != null ? ai.weight : cur.weight ?? null,
                    reps: ai.reps != null ? ai.reps : cur.reps ?? null,
                    rpe: ai.rpe != null ? ai.rpe : cur.rpe ?? null,
                  };
                });
                setDeloadSuggestions((prev) => ({ ...(prev && typeof prev === 'object' ? prev : {}), ...mergedEntries }));
              }
              suggestion = buildDeloadSuggestion(safeEx, safeIdx, aiSuggestion);
            }
          }
          if (!suggestion.ok) {
            const baseError = String((suggestion as Record<string, unknown>).error || '') || (!suggestionDraft.ok ? (suggestionDraft as Record<string, unknown>).error : '') || 'Sem dados suficientes para calcular o deload.';
            const baseErrorClean = String(baseError || '').replace(/^Deload indisponível:\s*/i, '');
            const reportMsg = reportHistoryStatus?.status === 'loading'
              ? 'Relatórios ainda carregando.'
              : reportHistoryStatus?.status === 'error'
                ? `Relatórios com erro: ${reportHistoryStatus?.error || 'falha desconhecida'}.`
                : '';
            const watermarkMsg = DELOAD_SUGGEST_MODE === 'watermark' && suggestionDraft.ok
              ? 'Sugestões aplicadas em marca d’água. '
              : '';
            try {
              await alert(`${watermarkMsg}Deload completo indisponível: ${baseErrorClean}${reportMsg ? ` ${reportMsg}` : ''}`);
            } catch { }
            return;
          }
          const reason = getDeloadReason(suggestion.analysis, suggestion.appliedReduction, suggestion.historyCount);
          setDeloadModal({
            ...suggestion,
            reductionPct: suggestion.appliedReduction,
            reason,
          });
        })(),
        totalTimeoutMs,
      );
    } catch (e: unknown) {
      try {
        await alert('Tempo limite ao processar o Deload. Tente novamente em instantes.');
      } catch { }
    }
  };

  const updateDeloadModalFromPercent = (value: unknown) => {
    if (!isObject(deloadModal)) return;
    const pct = clampNumber((toNumber(value) ?? 0) / 100, DELOAD_REDUCTION_MIN, DELOAD_REDUCTION_MAX);
    const baseWeight = Number(deloadModal.baseWeight || 0);
    if (!Number.isFinite(baseWeight) || baseWeight <= 0) return;
    const minWeight = Number(deloadModal.minWeight || 0);
    const suggestedRaw = baseWeight * (1 - pct);
    const suggestedWeight = roundToStep(Math.max(suggestedRaw, minWeight || 0), WEIGHT_ROUND_STEP);
    const appliedReduction = clampNumber(1 - suggestedWeight / baseWeight, 0, 1);
    setDeloadModal((prev) => (prev && typeof prev === 'object' ? { ...prev, reductionPct: appliedReduction, suggestedWeight } : prev));
  };

  const updateDeloadModalFromWeight = (value: unknown) => {
    if (!isObject(deloadModal)) return;
    const baseWeight = Number(deloadModal.baseWeight || 0);
    if (!Number.isFinite(baseWeight) || baseWeight <= 0) return;
    const minWeight = Number(deloadModal.minWeight || 0);
    const nextWeightRaw = toNumber(value);
    if (nextWeightRaw == null) return;
    const nextWeight = roundToStep(Math.max(nextWeightRaw, minWeight || 0), WEIGHT_ROUND_STEP);
    const appliedReduction = clampNumber(1 - nextWeight / baseWeight, 0, 1);
    setDeloadModal((prev) => (prev && typeof prev === 'object' ? { ...prev, reductionPct: appliedReduction, suggestedWeight: nextWeight } : prev));
  };

  const toggleNotes = (key: string) => {
    setOpenNotesKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const applyDeloadToExercise = async () => {
    if (!isObject(deloadModal)) return;
    const exIdx = Number(deloadModal.exIdx);
    if (!Number.isFinite(exIdx) || exIdx < 0) return;
    const ex = exercises?.[exIdx];
    if (!ex || typeof ex !== 'object') return;
    try {
      const { setsCount } = collectExerciseSetInputs(ex, exIdx, getLog);
      const baseWeight = Number(deloadModal.baseWeight || 0);
      const targetWeight = Number(deloadModal.suggestedWeight || 0);
      if (!Number.isFinite(baseWeight) || !Number.isFinite(targetWeight) || baseWeight <= 0 || targetWeight <= 0) {
        await alert('Peso inválido para aplicar deload.');
        return;
      }
      const ratio = targetWeight / baseWeight;
      const minWeight = Number(deloadModal.minWeight || 0);
      const appliedAt = new Date().toISOString();
      const appliedWeights: unknown[] = [];
      for (let setIdx = 0; setIdx < setsCount; setIdx += 1) {
        const key = `${exIdx}-${setIdx}`;
        const log = getLog(key);
        const cfg = getPlanConfig(ex, setIdx);
        const planned = getPlannedSet(ex, setIdx);
        const logWeight = extractLogWeight(log);
        const baseSetWeight = logWeight != null ? logWeight : toNumber(cfg?.weight ?? planned?.weight ?? baseWeight);
        if (!baseSetWeight || baseSetWeight <= 0) continue;
        const nextWeight = roundToStep(Math.max(baseSetWeight * ratio, minWeight || 0), WEIGHT_ROUND_STEP);
        const suggestionValue = deloadSuggestions[key];
        const suggestion = isObject(suggestionValue) ? (suggestionValue as UnknownRecord) : null;
        const currentReps = log.reps;
        const currentRpe = log.rpe;
        const hasReps = String(currentReps ?? '').trim().length > 0;
        const hasRpe = String(currentRpe ?? '').trim().length > 0;
        const nextReps = !hasReps && suggestion?.reps != null ? String(suggestion.reps) : currentReps;
        const nextRpe = !hasRpe && suggestion?.rpe != null ? String(suggestion.rpe) : currentRpe;
        updateLog(key, {
          weight: String(nextWeight),
          reps: nextReps,
          rpe: nextRpe,
          deload: {
            appliedAt,
            originalWeight: baseSetWeight,
            suggestedWeight: nextWeight,
            reductionPct: deloadModal.reductionPct,
            reason: deloadModal.reason,
            historyCount: deloadModal.historyCount,
          },
          advanced_config: cfg ?? log.advanced_config ?? null,
        });
        appliedWeights.push(nextWeight);
      }
      appendDeloadAudit({
        ts: Date.now(),
        exIdx,
        name: deloadModal.name,
        baseWeight: deloadModal.baseWeight,
        suggestedWeight: deloadModal.suggestedWeight,
        reductionPct: deloadModal.reductionPct,
        historyCount: deloadModal.historyCount,
        appliedAt,
        weights: appliedWeights,
        workoutId: workout?.id ?? null,
      });
      setDeloadModal(null);
    } catch (e: unknown) {
      try {
        await alert('Não foi possível aplicar o deload agora.');
      } catch { }
    }
  };

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
    if (!workout || typeof props?.onUpdateSession !== 'function') return;
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
      props.onUpdateSession({ workout: { ...workout, exercises: nextExercises } });
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
    if (!workout || typeof props?.onUpdateSession !== 'function') return;
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

      props.onUpdateSession({ workout: { ...workout, exercises: nextExercises }, logs: nextLogs });
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
    if (!workout || typeof props?.onUpdateSession !== 'function') return;
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

      props.onUpdateSession({ workout: { ...workout, exercises: nextExercises }, logs: nextLogs });
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
    if (!workout || typeof props?.onUpdateSession !== 'function') return;
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
      props.onUpdateSession({ workout: { ...workout, exercises: [...exercises, nextExercise] } });
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
      if (typeof props?.onUpdateSession === 'function') {
        props.onUpdateSession({ workout: { ...workout, exercises: orderedExercises } });
      }
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

  const requestPostWorkoutCheckin = async (): Promise<unknown | null> => {
    if (postCheckinOpen) return null;
    return await new Promise<unknown | null>((resolve) => {
      postCheckinResolveRef.current = (value: unknown) => {
        resolve(value ?? null);
      };
      setPostCheckinDraft({ rpe: '', satisfaction: '', soreness: '', notes: '' });
      setPostCheckinOpen(true);
    });
  };

  const finishWorkout = async () => {
    if (!session || !workout) return;
    if (finishing) return;

    const startedAtMs = parseStartedAtMs(session?.startedAt);
    const elapsedSeconds = startedAtMs > 0 ? Math.max(0, Math.floor((ticker - startedAtMs) / 1000)) : 0;

    const minSecondsForFullSession = 30 * 60;
    const elapsedSafe = Number(elapsedSeconds) || 0;
    let showReport = true;

    let ok = false;
    try {
      ok =
        typeof confirm === 'function'
          ? await confirm('Deseja finalizar o treino?', 'Finalizar treino', {
            confirmText: 'Sim',
            cancelText: 'Não',
          })
          : false;
    } catch {
      ok = false;
    }
    if (!ok) return;

    const isShort = elapsedSafe > 0 && Number.isFinite(elapsedSafe) && elapsedSafe < minSecondsForFullSession;
    let shouldSaveHistory = true;

    if (isShort) {
      let allowSaveShort = false;
      try {
        allowSaveShort =
          typeof confirm === 'function'
            ? await confirm(
              'Esse treino durou menos de 30 minutos. Deseja adicioná-lo no histórico?',
              'Treino curto (< 30 min)',
              {
                confirmText: 'Sim',
                cancelText: 'Não',
              }
            )
            : false;
      } catch {
        allowSaveShort = false;
      }
      shouldSaveHistory = !!allowSaveShort;
    }

    try {
      showReport =
        typeof confirm === 'function'
          ? await confirm('Deseja o relatório desse treino?', 'Gerar relatório?', {
            confirmText: 'Sim',
            cancelText: 'Não',
          })
          : true;
    } catch {
      showReport = true;
    }

    let postCheckin = null;
    if (shouldSaveHistory) {
      try {
        const prompt = settings ? settings.promptPostWorkoutCheckin !== false : true;
        if (prompt) postCheckin = await requestPostWorkoutCheckin();
      } catch {
        postCheckin = null;
      }
    }

    setFinishing(true);
    try {
      persistDeloadHistoryFromSession();
      const safePostCheckin = postCheckin && typeof postCheckin === 'object' ? (postCheckin as Record<string, unknown>) : null;
      const payload = buildFinishWorkoutPayload({ workout, elapsedSeconds, logs, ui, postCheckin: safePostCheckin });

      let savedId = null;
      if (shouldSaveHistory) {
        const idempotencyKey = `finish_${workout?.id || 'unknown'}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const submission = { session: payload, idempotencyKey };

        try {
          let onlineSuccess = false;
          if (isOnline()) {
            try {
              const resp = await fetch('/api/workouts/finish', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(submission),
              });

              if (resp.ok) {
                const json = await resp.json();
                savedId = json?.saved?.id ?? null;
                onlineSuccess = true;
              } else {
                if (resp.status >= 400 && resp.status < 500) {
                  const errText = await resp.text();
                  throw new Error(`Erro de validação: ${errText}`);
                }
                throw new Error(`Erro do servidor: ${resp.status}`);
              }
            } catch (fetchErr: unknown) {
              if (String(fetchErr).includes('Erro de validação')) throw fetchErr;
              logWarn('warn', 'Online save failed, attempting offline queue', fetchErr);
            }
          }

          if (!onlineSuccess) {
            await queueFinishWorkout(submission);
            await alert('Sem conexão estável. Treino salvo na fila e será sincronizado automaticamente.', 'Salvo Offline');
            savedId = 'offline-pending';
          }

        } catch (e: unknown) {
          const msg = isObject(e) && typeof e.message === 'string' ? e.message : String(e);
          if (msg.includes('Erro de validação')) {
            await alert(msg);
            setFinishing(false);
            return;
          }
          await alert('CRÍTICO: Erro ao salvar treino: ' + (msg || 'erro inesperado'));
          setFinishing(false);
          return;
        }
      }

      const sessionForReport = {
        ...payload,
        id: savedId,
      };

      try {
        if (typeof props?.onFinish === 'function') {
          props.onFinish(sessionForReport, showReport);
        }
      } catch { }
    } catch (e: unknown) {
      const msg = isObject(e) && typeof e.message === 'string' ? e.message : String(e);
      await alert('Erro ao finalizar: ' + (msg || 'erro inesperado'));
    } finally {
      setFinishing(false);
    }
  };


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
  };
}
