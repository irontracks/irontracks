
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { HELP_TERMS } from '@/utils/help/terms';

export function useActiveWorkoutController(props: ActiveWorkoutProps) {
  const { alert, confirm } = useDialog();
  const teamWorkout = useTeamWorkout() as unknown as { sendInvite: (targetUser: unknown, workout: UnknownRecord) => Promise<unknown> };
  const sendInvite = teamWorkout.sendInvite;
  const session = props.session;
  const workout = session?.workout ?? null;
  const exercises = useMemo<WorkoutExercise[]>(() => (Array.isArray(workout?.exercises) ? workout.exercises : []), [workout?.exercises]);
  const logs: Record<string, unknown> = session?.logs ?? {};
  const ui: UnknownRecord = session?.ui ?? {};
  const settings = props.settings ?? null;

  type PostCheckinDraft = { rpe: string; satisfaction: string; soreness: string; notes: string };
  type ReportHistoryStatus = { status: 'idle' | 'loading' | 'ready' | 'error'; error: string; source: string };
  type InputRefMap = Record<string, Array<HTMLInputElement | null>>;

  const [ticker, setTicker] = useState<number>(Date.now());
  const [collapsed, setCollapsed] = useState<Set<number>>(() => new Set<number>());
  const [finishing, setFinishing] = useState<boolean>(false);
  const [openNotesKeys, setOpenNotesKeys] = useState<Set<string>>(() => new Set<string>());
  const [inviteOpen, setInviteOpen] = useState<boolean>(false);
  const [addExerciseOpen, setAddExerciseOpen] = useState<boolean>(false);
  const [addExerciseDraft, setAddExerciseDraft] = useState<{ name: string; sets: string; restTime: string }>(() => ({
    name: '',
    sets: '3',
    restTime: '60',
  }));
  const [organizeOpen, setOrganizeOpen] = useState<boolean>(false);
  const [organizeDraft, setOrganizeDraft] = useState<UnknownRecord[]>([]);
  const [organizeSaving, setOrganizeSaving] = useState<boolean>(false);
  const [organizeError, setOrganizeError] = useState<string>('');
  const [deloadModal, setDeloadModal] = useState<UnknownRecord | null>(null);
  const [clusterModal, setClusterModal] = useState<UnknownRecord | null>(null);
  const [restPauseModal, setRestPauseModal] = useState<UnknownRecord | null>(null);
  const [dropSetModal, setDropSetModal] = useState<UnknownRecord | null>(null);
  const [postCheckinOpen, setPostCheckinOpen] = useState<boolean>(false);
  const [postCheckinDraft, setPostCheckinDraft] = useState<PostCheckinDraft>({ rpe: '', satisfaction: '', soreness: '', notes: '' });
  const postCheckinResolveRef = useRef<((value: unknown) => void) | null>(null);
  const [reportHistory, setReportHistory] = useState<ReportHistory>({ version: 1, exercises: {} });
  const [reportHistoryStatus, setReportHistoryStatus] = useState<ReportHistoryStatus>({ status: 'idle', error: '', source: '' });
  const [reportHistoryUpdatedAt, setReportHistoryUpdatedAt] = useState<number>(0);
  const [deloadSuggestions, setDeloadSuggestions] = useState<Record<string, unknown>>({});
  const [timerMinimized, setTimerMinimized] = useState<boolean>(false);
  const [currentExerciseIdx, setCurrentExerciseIdx] = useState<number>(0);
  const [editExerciseOpen, setEditExerciseOpen] = useState<boolean>(false);
  const [editExerciseIdx, setEditExerciseIdx] = useState<number | null>(null);
  const [editExerciseDraft, setEditExerciseDraft] = useState<{ name: string; sets: string; restTime: string; method: string }>(() => ({
    name: '',
    sets: '3',
    restTime: '60',
    method: 'Normal',
  }));

  const restPauseRefs = useRef<InputRefMap>({});
  const clusterRefs = useRef<InputRefMap>({});
  const organizeBaseKeysRef = useRef<string[]>([]);
  const reportHistoryLoadingRef = useRef<boolean>(false);
  const reportHistoryLoadingSinceRef = useRef<number>(0);
  const reportHistoryStatusRef = useRef<ReportHistoryStatus>({ status: 'idle', error: '', source: '' });
  const reportHistoryUpdatedAtRef = useRef<number>(0);
  const deloadAiCacheRef = useRef<Record<string, unknown>>({});
  const supabase = useStableSupabaseClient();
  const MAX_EXTRA_SETS_PER_EXERCISE = 50;
  const MAX_EXTRA_EXERCISES_PER_WORKOUT = 50;
  const DEFAULT_EXTRA_EXERCISE_REST_TIME_S = 60;

  useEffect(() => {
    const id = setInterval(() => setTicker(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    reportHistoryStatusRef.current = reportHistoryStatus && typeof reportHistoryStatus === 'object' ? reportHistoryStatus : { status: 'idle', error: '', source: '' };
  }, [reportHistoryStatus]);

  useEffect(() => {
    reportHistoryUpdatedAtRef.current = Number(reportHistoryUpdatedAt || 0);
  }, [reportHistoryUpdatedAt]);

  const organizeDirty = useMemo(() => {
    const baseKeys = Array.isArray(organizeBaseKeysRef.current) ? organizeBaseKeysRef.current : [];
    const draftKeys = draftOrderKeys(organizeDraft);
    if (draftKeys.length !== baseKeys.length) return true;
    for (let i = 0; i < draftKeys.length; i += 1) {
      if (draftKeys[i] !== baseKeys[i]) return true;
    }
    return false;
  }, [organizeDraft]);

  const getLog = (key: string): UnknownRecord => {
    const v = logs[key];
    return isObject(v) ? v : {};
  };

  const updateLog = (key: string, patch: unknown) => {
    try {
      if (typeof props?.onUpdateLog !== 'function') return;
      const prev = getLog(key);
      const patchObj: UnknownRecord = isObject(patch) ? patch : {};
      props.onUpdateLog(key, { ...prev, ...patchObj });
    } catch {}
  };

  const getPlanConfig = (ex: WorkoutExercise, setIdx: number): UnknownRecord | null => {
    const sdArr: unknown[] = Array.isArray(ex.setDetails) ? (ex.setDetails as unknown[]) : Array.isArray(ex.set_details) ? (ex.set_details as unknown[]) : [];
    const sd = isObject(sdArr?.[setIdx]) ? (sdArr[setIdx] as UnknownRecord) : null;
    const cfg = sd ? (sd.advanced_config ?? sd.advancedConfig ?? null) : null;
    return isObject(cfg) ? cfg : null;
  };

  const normalizeNaturalNote = (v: unknown) => {
    try {
      return String(v ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
    } catch {
      return String(v ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
    }
  };

  const inferDropSetStagesFromNote = (notes: unknown): number => {
    const s = normalizeNaturalNote(notes);
    if (!s) return 0;
    if (!s.includes('drop')) return 0;
    const isDouble = s.includes('duplo') || s.includes('dupla') || s.includes('2 drops') || s.includes('2drop');
    const isTriple = s.includes('triplo') || s.includes('tripla') || s.includes('3 drops') || s.includes('3drop');
    if (isTriple) return 4;
    if (isDouble) return 3;
    return 2;
  };

  const shouldInjectDropSetForSet = (ex: WorkoutExercise, setIdx: number, setsCount: number): number => {
    const notes = String(ex?.notes ?? '').trim();
    if (!notes) return 0;
    const normalized = normalizeNaturalNote(notes);
    if (!normalized.includes('drop')) return 0;
    if (normalized.includes('em todas') || normalized.includes('todas as series') || normalized.includes('todas series')) {
      return inferDropSetStagesFromNote(notes);
    }
    const wantsLast = normalized.includes('ultima') || normalized.includes('ultim');
    if (!wantsLast) return 0;
    if (setIdx !== Math.max(0, setsCount - 1)) return 0;
    return inferDropSetStagesFromNote(notes);
  };

  const getPlannedSet = (ex: WorkoutExercise, setIdx: number): UnknownRecord | null => {
    const sdArr: unknown[] = Array.isArray(ex.setDetails) ? (ex.setDetails as unknown[]) : Array.isArray(ex.set_details) ? (ex.set_details as unknown[]) : [];
    const sd = isObject(sdArr?.[setIdx]) ? (sdArr[setIdx] as UnknownRecord) : null;
    const rawCfg = sd ? (sd.advanced_config ?? sd.advancedConfig ?? null) : null;
    if (Array.isArray(rawCfg) && rawCfg.length > 0) return sd;

    const setsHeader = Math.max(0, Number.parseInt(String(ex?.sets ?? '0'), 10) || 0);
    const setsCount = Math.max(setsHeader, Array.isArray(sdArr) ? sdArr.length : 0) || 0;
    const inferredStages = shouldInjectDropSetForSet(ex, setIdx, setsCount);
    if (inferredStages > 0) {
      const stages = Array.from({ length: inferredStages }).map(() => ({ weight: null as number | null, reps: null as number | null }));
      return {
        ...(sd || {}),
        it_auto: { ...(isObject(sd?.it_auto) ? (sd?.it_auto as UnknownRecord) : {}), label: 'Drop' },
        advanced_config: stages,
      };
    }

    return sd;
  };

  const collectExerciseSetInputs = (ex: WorkoutExercise, exIdx: number) => {
    const setsHeader = Math.max(0, Number.parseInt(String(ex?.sets ?? '0'), 10) || 0);
    const sdArr: unknown[] = Array.isArray(ex.setDetails) ? (ex.setDetails as unknown[]) : Array.isArray(ex.set_details) ? (ex.set_details as unknown[]) : [];
    const setsCount = Math.max(setsHeader, Array.isArray(sdArr) ? sdArr.length : 0);
    const sets: Array<{ weight: number | null; reps: number | null }> = [];
    for (let setIdx = 0; setIdx < setsCount; setIdx += 1) {
      const key = `${exIdx}-${setIdx}`;
      const log = getLog(key);
      const cfg = getPlanConfig(ex, setIdx);
      const planned = getPlannedSet(ex, setIdx);
      const logWeight = extractLogWeight(log);
      const fallbackWeight = toNumber(cfg?.weight ?? planned?.weight ?? null);
      const weight = logWeight != null ? logWeight : fallbackWeight;
      const reps = toNumber(log.reps ?? planned?.reps ?? ex?.reps ?? null);
      if (weight != null || reps != null) {
        sets.push({ weight, reps });
      }
    }
    return { setsCount, sets };
  };

  const collectExercisePlannedInputs = (ex: WorkoutExercise, exIdx: number) => {
    const setsHeader = Math.max(0, Number.parseInt(String(ex?.sets ?? '0'), 10) || 0);
    const sdArr: unknown[] = Array.isArray(ex.setDetails) ? (ex.setDetails as unknown[]) : Array.isArray(ex.set_details) ? (ex.set_details as unknown[]) : [];
    const setsCount = Math.max(setsHeader, Array.isArray(sdArr) ? sdArr.length : 0);
    const sets: Array<{ weight: number | null; reps: number | null }> = [];
    for (let setIdx = 0; setIdx < setsCount; setIdx += 1) {
      const cfg = getPlanConfig(ex, setIdx);
      const planned = getPlannedSet(ex, setIdx);
      const weight = toNumber(cfg?.weight ?? planned?.weight ?? ex?.weight ?? null);
      const reps = toNumber(planned?.reps ?? ex?.reps ?? null);
      if (weight != null || reps != null) {
        sets.push({ weight, reps });
      }
    }
    return { setsCount, sets };
  };

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
          } catch {}
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
    } catch {}
  }, [ticker]);

  const loadDeloadHistory = (): ReportHistory => {
    try {
      if (typeof window === 'undefined') return { version: 1, exercises: {} };
      const raw = window.localStorage.getItem(DELOAD_HISTORY_KEY);
      if (!raw) return { version: 1, exercises: {} };
      const parsed = safeJsonParse(raw);
      return normalizeReportHistory(parsed);
    } catch {
      return { version: 1, exercises: {} };
    }
  };

  const saveDeloadHistory = (next: ReportHistory) => {
    try {
      if (typeof window === 'undefined') return;
      window.localStorage.setItem(DELOAD_HISTORY_KEY, JSON.stringify(next));
    } catch {}
  };

  const appendDeloadAudit = (entry: unknown) => {
    try {
      if (typeof window === 'undefined') return;
      const raw = window.localStorage.getItem(DELOAD_AUDIT_KEY);
      const parsed: unknown = raw ? safeJsonParse(raw) : null;
      const list: unknown[] = Array.isArray(parsed) ? parsed : [];
      const next = [entry, ...list].slice(0, 100);
      window.localStorage.setItem(DELOAD_AUDIT_KEY, JSON.stringify(next));
    } catch {}
  };

  const buildExerciseHistoryEntry = (ex: WorkoutExercise, exIdx: number): ReportHistoryItem | null => {
    const { sets } = collectExerciseSetInputs(ex, exIdx);
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
    } catch {}
  };

  const analyzeDeloadHistory = (items: ReportHistoryItem[]): DeloadAnalysis => {
    const ordered = Array.isArray(items) ? items.slice(-DELOAD_HISTORY_SIZE) : [];
    const recent = ordered.slice(-DELOAD_RECENT_WINDOW);
    const older = ordered.slice(0, Math.max(0, ordered.length - recent.length));
    const avgRecentVolume = averageNumbers(recent.map((i) => i.totalVolume).filter((v) => typeof v === 'number' && Number.isFinite(v) && v > 0));
    const avgOlderVolume = averageNumbers(older.map((i) => i.totalVolume).filter((v) => typeof v === 'number' && Number.isFinite(v) && v > 0));
    const avgRecentWeight = averageNumbers(recent.map((i) => i.avgWeight).filter((v) => typeof v === 'number' && Number.isFinite(v) && v > 0));
    const avgOlderWeight = averageNumbers(older.map((i) => i.avgWeight).filter((v) => typeof v === 'number' && Number.isFinite(v) && v > 0));

    const volumeDelta = avgOlderVolume && avgRecentVolume ? (avgRecentVolume - avgOlderVolume) / avgOlderVolume : null;
    const weightDelta = avgOlderWeight && avgRecentWeight ? (avgRecentWeight - avgOlderWeight) / avgOlderWeight : null;

    const hasRegression =
      (volumeDelta != null && volumeDelta <= -DELOAD_REGRESSION_PCT) ||
      (weightDelta != null && weightDelta <= -DELOAD_REGRESSION_PCT);
    const hasStagnation =
      (!hasRegression && volumeDelta != null && Math.abs(volumeDelta) <= DELOAD_STAGNATION_PCT) ||
      (!hasRegression && weightDelta != null && Math.abs(weightDelta) <= DELOAD_STAGNATION_PCT);

    const status: DeloadAnalysis['status'] = hasRegression ? 'overtraining' : hasStagnation ? 'stagnation' : 'stable';
    return { status, volumeDelta, weightDelta };
  };

  const parseAiRecommendation = (text: unknown): AiRecommendation => {
    try {
      const raw = String(text || '').trim();
      if (!raw) return { weight: null, reps: null, rpe: null };
      const weightMatch = raw.match(/(\d+(?:[.,]\d+)?)\s*kg/i);
      const repsMatch = raw.match(/(\d+(?:[.,]\d+)?)\s*reps?/i);
      const rpeMatch = raw.match(/rpe\s*([0-9]+(?:[.,]\d+)?)/i);
      const weight = toNumber(weightMatch ? weightMatch[1] : null);
      const reps = toNumber(repsMatch ? repsMatch[1] : null);
      const rpe = toNumber(rpeMatch ? rpeMatch[1] : null);
      return { weight: weight && weight > 0 ? weight : null, reps: reps && reps > 0 ? reps : null, rpe: rpe && rpe > 0 ? rpe : null };
    } catch {
      return { weight: null, reps: null, rpe: null };
    }
  };

  const estimate1RmFromSets = (
    sets: Array<{ weight: number | null; reps: number | null }>,
    historyItems: ReportHistoryItem[],
  ): number | null => {
    const candidates: number[] = [];
    const list = Array.isArray(sets) ? sets : [];
    list.forEach((s) => {
      const w = Number(s.weight ?? 0);
      const r = Number(s.reps ?? 0);
      const est = estimate1Rm(w, r);
      if (est) candidates.push(est);
    });
    const hist = Array.isArray(historyItems) ? historyItems : [];
    hist.forEach((h) => {
      const est = estimate1Rm(h.topWeight ?? null, h.avgReps ?? null);
      if (est) candidates.push(est);
    });
    if (!candidates.length) return null;
    return Math.max(...candidates);
  };

  const buildDeloadSuggestion = (ex: WorkoutExercise, exIdx: number, aiSuggestion: AiRecommendation | null = null): DeloadSuggestion => {
    const name = String(ex?.name || '').trim() || `Exercício ${exIdx + 1}`;
    const key = normalizeExerciseKey(name);
    const history = loadDeloadHistory();
    const items = history.exercises[key]?.items ?? [];
    const reportItems = reportHistory.exercises[key]?.items ?? [];
    const preferredItems: ReportHistoryItem[] = reportItems.length ? reportItems : items;
    const currentInputs = collectExerciseSetInputs(ex, exIdx);
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

  const getDeloadReason = (analysis: DeloadAnalysis, reductionPct: number, historyCount: number) => {
    const pct = Math.round((Number(reductionPct) || 0) * 1000) / 10;
    const label =
      analysis?.status === 'overtraining'
        ? 'regressão'
        : analysis?.status === 'stagnation'
          ? 'estagnação'
          : 'progressão estável';
    const historyLabel = historyCount >= DELOAD_HISTORY_MIN ? `${historyCount} treinos` : `histórico curto (${historyCount || 0} treinos)`;
    return `Redução de ${pct}% devido à ${label} nos últimos ${historyLabel}.`;
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
      const { setsCount } = collectExerciseSetInputs(ex, exIdx);
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
            } catch {}
            return;
          }
          const name = String(safeEx?.name || '').trim() || `Exercício ${safeIdx + 1}`;
          const { setsCount } = collectExerciseSetInputs(safeEx, safeIdx);
          if (!setsCount || setsCount <= 0) {
            try {
              await alert('Deload indisponível: exercício sem séries configuradas.');
            } catch {}
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
            } catch {}
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
      } catch {}
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
      const { setsCount } = collectExerciseSetInputs(ex, exIdx);
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
      } catch {}
    }
  };

  const startTimer = (seconds: unknown, context: unknown) => {
    try {
      if (typeof props?.onStartTimer !== 'function') return;
      const s = Number(seconds);
      if (!Number.isFinite(s) || s <= 0) return;
      props.onStartTimer(s, context);
    } catch {}
  };

  const toggleCollapse = (exIdx: number) => {
    setCollapsed((prev) => {
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
      } catch {}
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
      } catch {}
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
      } catch {}
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

      const nextSetDetails: unknown[] = [];
      for (let i = 0; i < desiredSets; i += 1) {
        const current = sdArr[i];
        const currentObj = current && typeof current === 'object' ? (current as UnknownRecord) : null;
        const setNumber = i + 1;
        if (currentObj) {
          nextSetDetails.push({ ...currentObj, set_number: (currentObj.set_number ?? currentObj.setNumber) ?? setNumber });
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
          } catch {}
        }
      }

      props.onUpdateSession({ workout: { ...workout, exercises: nextExercises }, logs: nextLogs });
      setEditExerciseOpen(false);
      setEditExerciseIdx(null);
    } catch (e: unknown) {
      try {
        const msg = isObject(e) && typeof e.message === 'string' ? e.message : String(e || '');
        await alert('Não foi possível salvar a edição do exercício: ' + msg);
      } catch {}
    }
  };

  const addExtraExerciseToWorkout = async () => {
    if (!workout || typeof props?.onUpdateSession !== 'function') return;
    if (exercises.length >= MAX_EXTRA_EXERCISES_PER_WORKOUT) return;
    const name = String(addExerciseDraft?.name || '').trim();
    if (!name) {
      try {
        await alert('Informe o nome do exercício.', 'Exercício extra');
      } catch {}
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
      } catch {}
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
      }).catch((): any => null);
      const result = response ? await response.json().catch((): any => null) : null;
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
      } catch {}
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

    const startedAtMs = session?.startedAt ? new Date(session.startedAt).getTime() : 0;
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
                 console.warn('Online save failed, attempting offline queue', fetchErr);
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
      } catch {}
    } catch (e: unknown) {
      const msg = isObject(e) && typeof e.message === 'string' ? e.message : String(e);
      await alert('Erro ao finalizar: ' + (msg || 'erro inesperado'));
    } finally {
      setFinishing(false);
    }
  };

  const saveClusterModal = () => {
    try {
      const m = isObject(clusterModal) ? clusterModal : null;
      const key = String(m?.key || '').trim();
      if (!key) {
        setClusterModal((prev) => (prev && typeof prev === 'object' ? { ...prev, error: 'Série inválida. Feche e abra novamente.' } : prev));
        return;
      }
      const blocksRaw = m?.blocks ?? null;
      const blocks: unknown[] = Array.isArray(blocksRaw) ? blocksRaw : [];
      if (!blocks.length) {
        setClusterModal((prev) =>
          prev && typeof prev === 'object'
            ? { ...prev, error: 'Nenhum bloco encontrado. Verifique a configuração (total reps, cluster size e descanso).' }
            : prev,
        );
        return;
      }
      const planned: UnknownRecord = isObject(m?.planned) ? (m.planned as UnknownRecord) : {};
      const intra = Number(m?.intra);
      const restsByGap: unknown[] = Array.isArray(m?.restsByGap) ? (m.restsByGap as unknown[]) : [];
      const done = !!getLog(key).done;
      const baseAdvanced = m?.cfg ?? getLog(key).advanced_config ?? null;

      const blocksDetailed: Array<{ weight: string; reps: number; restSecAfter: number | null }> = [];
      const repsBlocks: number[] = [];
      let total = 0;
      for (let i = 0; i < blocks.length; i += 1) {
        const b: UnknownRecord = isObject(blocks[i]) ? (blocks[i] as UnknownRecord) : {};
        const weight = String(b.weight ?? '').trim();
        const reps = parseTrainingNumber(b.reps);
        if (!weight) {
          setClusterModal((prev) => (prev && typeof prev === 'object' ? { ...prev, error: 'Preencha o peso (kg) em todos os blocos.' } : prev));
          return;
        }
        if (!reps || reps <= 0) {
          setClusterModal((prev) => (prev && typeof prev === 'object' ? { ...prev, error: 'Preencha as reps em todos os blocos.' } : prev));
          return;
        }
        const gapRest = restsByGap[i];
        const restSecAfter = i < blocks.length - 1 ? (Number.isFinite(Number(gapRest)) ? Number(gapRest) : Number.isFinite(intra) ? intra : null) : null;
        blocksDetailed.push({ weight, reps, restSecAfter });
        repsBlocks.push(reps);
        total += reps;
      }

      const lastWeight = String(blocksDetailed[blocksDetailed.length - 1]?.weight ?? '').trim();
      const rpe = String(m?.rpe ?? '').trim();

      updateLog(key, {
        done,
        weight: lastWeight,
        reps: String(total || ''),
        rpe: rpe || '',
        cluster: {
          planned: {
            total_reps: planned.total_reps ?? null,
            cluster_size: planned.cluster_size ?? null,
            cluster_blocks_count: planned.cluster_blocks_count ?? null,
            intra_rest_sec: planned.intra_rest_sec ?? null,
          },
          plannedBlocks: Array.isArray(m?.plannedBlocks) ? (m.plannedBlocks as unknown[]) : null,
          blocks: repsBlocks,
          blocksDetailed,
        },
        advanced_config: baseAdvanced,
      });
      setClusterModal(null);
    } catch {}
  };

  const saveRestPauseModal = () => {
    try {
      const m = isObject(restPauseModal) ? restPauseModal : null;
      const key = String(m?.key || '').trim();
      if (!key) {
        setRestPauseModal((prev) => (prev && typeof prev === 'object' ? { ...prev, error: 'Série inválida. Feche e abra novamente.' } : prev));
        return;
      }

      const weight = String(m?.weight ?? '').trim();
      if (!weight) {
        setRestPauseModal((prev) => (prev && typeof prev === 'object' ? { ...prev, error: 'Preencha o peso (kg).' } : prev));
        return;
      }

      const activationReps = parseTrainingNumber(m?.activationReps);
      if (!activationReps || activationReps <= 0) {
        setRestPauseModal((prev) => (prev && typeof prev === 'object' ? { ...prev, error: 'Preencha as reps de ativação.' } : prev));
        return;
      }

      const minisRaw = m?.minis ?? null;
      const minis: unknown[] = Array.isArray(minisRaw) ? minisRaw : [];
      const miniRepsParsed = minis.map((v) => {
        const n = parseTrainingNumber(v);
        return n != null && n > 0 ? n : null;
      });
      if (miniRepsParsed.some((v) => v == null)) {
        setRestPauseModal((prev) => (prev && typeof prev === 'object' ? { ...prev, error: 'Preencha as reps de todos os minis.' } : prev));
        return;
      }
      const miniReps = miniRepsParsed.filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0);

      const pauseSec = parseTrainingNumber(m?.pauseSec) ?? 15;
      const rpe = String(m?.rpe ?? '').trim();
      const cfg = m?.cfg ?? getLog(key)?.advanced_config ?? null;

      const total = activationReps + miniReps.reduce((acc, v) => acc + v, 0);
      updateLog(key, {
        done: !!getLog(key)?.done,
        weight,
        reps: String(total || ''),
        rpe: rpe || '',
        rest_pause: {
          activation_reps: activationReps,
          mini_reps: miniReps,
          rest_time_sec: pauseSec,
          planned_mini_sets: miniReps.length,
        },
        advanced_config: cfg,
      });
      setRestPauseModal(null);
    } catch {}
  };

  const saveDropSetModal = () => {
    try {
      const m = dropSetModal && typeof dropSetModal === 'object' ? dropSetModal : null;
      const key = String(m?.key || '').trim();
      if (!key) {
        setDropSetModal((prev) => (prev && typeof prev === 'object' ? { ...prev, error: 'Série inválida. Feche e abra novamente.' } : prev));
        return;
      }
      const stagesRaw = Array.isArray(m?.stages) ? m.stages : [];
      if (stagesRaw.length < 2) {
        setDropSetModal((prev) => (prev && typeof prev === 'object' ? { ...prev, error: 'Defina pelo menos 2 etapas.' } : prev));
        return;
      }

      const stages: { weight: string; reps: number }[] = [];
      let total = 0;
      for (let i = 0; i < stagesRaw.length; i += 1) {
        const s = stagesRaw[i] && typeof stagesRaw[i] === 'object' ? stagesRaw[i] : {};
        const weight = String(s?.weight ?? '').trim();
        const reps = parseTrainingNumber(s?.reps);
        if (!weight) {
          setDropSetModal((prev) => (prev && typeof prev === 'object' ? { ...prev, error: 'Preencha o peso (kg) em todas as etapas.' } : prev));
          return;
        }
        if (!reps || reps <= 0) {
          setDropSetModal((prev) => (prev && typeof prev === 'object' ? { ...prev, error: 'Preencha as reps em todas as etapas.' } : prev));
          return;
        }
        stages.push({ weight, reps });
        total += reps;
      }

      const lastWeight = String(stages[stages.length - 1]?.weight ?? '').trim();
      updateLog(key, {
        done: !!getLog(key)?.done,
        weight: lastWeight,
        reps: String(total || ''),
        drop_set: { stages },
      });
      setDropSetModal(null);
    } catch {}
  };

  const currentExercise = exercises[currentExerciseIdx] ?? null;

  const elapsedSeconds = useMemo(() => {
    const startedAtMs = session?.startedAt ? new Date(session.startedAt).getTime() : 0;
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
    openEditExercise,
    saveEditExercise,
    addExtraExerciseToWorkout,
    openOrganizeModal,
    requestCloseOrganize,
    saveOrganize,
    finishWorkout,
    openDeloadModal,
    startTimer,
    saveClusterModal,
    saveRestPauseModal,
    saveDropSetModal,
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
