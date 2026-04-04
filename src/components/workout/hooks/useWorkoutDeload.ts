import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  UnknownRecord,
  WorkoutExercise,
  WorkoutSession,
  ReportHistory,
  ReportHistoryItem,
  AiRecommendation,
  DeloadSetEntries,
  DeloadSetSuggestion,
  DeloadSuggestion
} from '../types';
import {
  isObject,
  toNumber,
  safeJsonParse,
  toDateMs,
  averageNumbers,
  extractLogWeight,
  withTimeout,
  readReportCache,
  writeReportCache,
  clampNumber,
  roundToStep,
  normalizeExerciseKey,
  DELOAD_HISTORY_SIZE,
  DELOAD_REDUCTION_STABLE,
  DELOAD_REDUCTION_STAGNATION,
  DELOAD_REDUCTION_OVERTRAIN,
  DELOAD_MIN_1RM_FACTOR,
  DELOAD_REDUCTION_MIN,
  DELOAD_REDUCTION_MAX,
  DELOAD_SUGGEST_MODE,
  DEFAULT_SUGGESTED_RPE,
  WEIGHT_ROUND_STEP,
  REPORT_FETCH_TIMEOUT_MS,
  REPORT_HISTORY_LIMIT,
  AI_SUGGESTION_TIMEOUT_MS,
  AI_SUGGESTION_MIN_HISTORY,
} from '../utils';
import {
  collectExerciseSetInputs,
  collectExercisePlannedInputs,
} from '../helpers/setPlanningHelpers';
import {
  loadDeloadHistory,
  saveDeloadHistory,
  appendDeloadAudit,
  analyzeDeloadHistory,
  parseAiRecommendation,
  estimate1RmFromSets,
  getDeloadReason,
} from '../helpers/deloadHelpers';
import { generatePostWorkoutInsights } from '@/actions/workout-actions';
import { logError } from '@/lib/logger';
import { useStableSupabaseClient } from '@/hooks/useStableSupabaseClient';

interface UseWorkoutDeloadProps {
  session: WorkoutSession | null;
  workout: UnknownRecord | null;
  exercises: WorkoutExercise[];
  logs: Record<string, unknown>;
  getLog: (key: string) => UnknownRecord;
  updateLog: (key: string, patch: unknown) => void;
  getPlanConfig: (ex: WorkoutExercise, setIdx: number) => UnknownRecord | null;
  getPlannedSet: (ex: WorkoutExercise, setIdx: number) => UnknownRecord | null;
  alert: (msg: string, title?: string) => Promise<void>;
  confirm: (msg: string, title?: string) => Promise<boolean>;
}

export function useWorkoutDeload(props: UseWorkoutDeloadProps) {
  const {
    session,
    workout,
    exercises,
    getLog,
    updateLog,
    getPlanConfig,
    getPlannedSet,
    alert,
    confirm,
  } = props;

  // Report history state
  const [reportHistory, setReportHistory] = useState<ReportHistory>({ version: 1, exercises: {} });
  type ReportHistoryStatus = { status: 'idle' | 'loading' | 'ready' | 'error'; error: string; source: string };
  const [reportHistoryStatus, setReportHistoryStatus] = useState<ReportHistoryStatus>({ status: 'idle', error: '', source: '' });
  const [reportHistoryUpdatedAt, setReportHistoryUpdatedAt] = useState<number>(0);
  const [deloadSuggestions, setDeloadSuggestions] = useState<Record<string, unknown>>({});
  const [deloadModal, setDeloadModal] = useState<UnknownRecord | null>(null);

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

  const buildExerciseHistoryEntryFromSessionLogs = useCallback(
    (sessionObj: unknown, exIdx: number, meta: UnknownRecord): ReportHistoryItem | null => {
      try {
        const base = isObject(sessionObj) ? sessionObj : null;
        if (!base) return null;
        const logsObj: UnknownRecord = isObject(base.logs) ? (base.logs as UnknownRecord) : {};
        // Coleta sets com índice para manter a ordenção correta
        const indexedSets: Array<{ setIdx: number; weight: number | null; reps: number | null; rpe: number | null }> = [];
        Object.entries(logsObj).forEach(([key, value]) => {
          try {
            const parts = String(key || '').split('-');
            const eIdx = Number(parts[0]);
            const sIdx = Number(parts[1]);
            if (!Number.isFinite(eIdx) || eIdx !== exIdx) return;
            if (!Number.isFinite(sIdx)) return;
            const log = isObject(value) ? value : null;
            if (!log) return;
            const weight = extractLogWeight(log);
            const reps = toNumber(log.reps ?? null);
            const rpe = toNumber(log.rpe ?? null);
            const hasValues = weight != null || reps != null;
            const doneRaw = log.done ?? log.isDone ?? log.completed ?? null;
            const done = doneRaw == null ? true : doneRaw === true || String(doneRaw || '').toLowerCase() === 'true';
            if (!done && !hasValues) return;
            if (hasValues) {
              indexedSets.push({ setIdx: sIdx, weight, reps, rpe });
            }
          } catch { }
        });

        if (!indexedSets.length) return null;
        // Ordena por índice de série para preservar progressão correta
        indexedSets.sort((a, b) => a.setIdx - b.setIdx);
        const sets = indexedSets.map(s => ({ weight: s.weight, reps: s.reps }));
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
        // Armazena pesos, reps e RPE individuais por série
        const setWeights = indexedSets
          .map(s => s.weight)
          .filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0);
        const setReps = indexedSets
          .map(s => s.reps)
          .filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0);
        const setRpes = indexedSets
          .map(s => s.rpe)
          .filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0);
        return {
          ts,
          avgWeight: avgWeight ?? null,
          avgReps: avgReps ?? null,
          totalVolume: Number.isFinite(totalVolume) ? totalVolume : 0,
          topWeight,
          setsCount: sets.length,
          setWeights: setWeights.length > 0 ? setWeights : null,
          setReps: setReps.length > 0 ? setReps : null,
          setRpes: setRpes.length > 0 ? setRpes : null,
        };
      } catch (e) {
        logError('hook:useWorkoutDeload.buildHistoryEntry', e);
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
      } catch (e) {
        logError('hook:useWorkoutDeload.buildReportHistory', e);
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
      } catch (e) {
        logError('hook:useWorkoutDeload.fetchReportHistory', e);
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

  // Watchdog: detect stale loading state and timeout (replaces old ticker dep)
  useEffect(() => {
    const id = setInterval(() => {
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
    }, 2000); // Check every 2s — no need for 1s granularity on a timeout watchdog
    return () => clearInterval(id);
  }, []);

  // ── Popula deloadSuggestions com o peso do último treino como watermark ──
  // Roda sempre que reportHistory muda (carregou do cache ou da rede).
  // Não altera logs já preenchidos — é só placeholder.
  useEffect(() => {
    try {
      const exerciseKeys = Object.keys(reportHistory.exercises ?? {});
      if (!exerciseKeys.length) return;
      if (!Array.isArray(exercises) || !exercises.length) return;

      const patch: Record<string, unknown> = {};

      exercises.forEach((ex, exIdx) => {
        const name = String(ex?.name || '').trim();
        if (!name) return;
        const exKey = normalizeExerciseKey(name);
        const histEntry = reportHistory.exercises[exKey];
        if (!histEntry) return;

        const items: ReportHistoryItem[] = Array.isArray(histEntry.items) ? histEntry.items : [];
        if (!items.length) return;

        // Último treino (mais recente)
        const latest = items.slice().sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0))[0];
        // Pesos por série do último treino (preservados se existirem)
        const perSetWeights: number[] = Array.isArray(latest?.setWeights) ? (latest.setWeights as number[]) : [];
        const perSetReps: number[] = Array.isArray(latest?.setReps) ? (latest.setReps as number[]) : [];
        const perSetRpes: number[] = Array.isArray(latest?.setRpes) ? (latest.setRpes as number[]) : [];
        // Fallback de peso único quando não há dados por série
        const fallbackWeight = toNumber(latest?.topWeight ?? latest?.avgWeight ?? null);
        const fallbackReps = toNumber(latest?.avgReps ?? null);
        if (!fallbackWeight && !perSetWeights.length) return;

        // Número de séries do exercício atual
        const setsHeader = Math.max(0, Number(ex?.sets ?? 0));
        const sdArr: unknown[] = Array.isArray(ex?.setDetails) ? (ex.setDetails as unknown[]) :
          Array.isArray(ex?.set_details) ? (ex.set_details as unknown[]) : [];
        const setsCount = Math.max(setsHeader, sdArr.length, 1);

        for (let setIdx = 0; setIdx < setsCount; setIdx++) {
          const setKey = `${exIdx}-${setIdx}`;
          const existingSuggestion = deloadSuggestions[setKey];
          // Não sobrescreve sugestão de deload já calculada (só adiciona se vazio)
          if (isObject(existingSuggestion) && (existingSuggestion as Record<string, unknown>).weight != null) continue;
          // Usa o peso específico da série se disponível, senão usa fallback (topWeight ou avgWeight)
          const setWeight = perSetWeights[setIdx] ?? fallbackWeight;
          const setRepsVal = perSetReps[setIdx] ?? fallbackReps;
          const setRpeVal = perSetRpes[setIdx] ?? null;
          if (!setWeight || !Number.isFinite(setWeight) || setWeight <= 0) continue;
          patch[setKey] = {
            weight: setWeight,
            reps: setRepsVal ?? null,
            rpe: setRpeVal,
          };
        }
      });

      if (Object.keys(patch).length > 0) {
        setDeloadSuggestions((prev) => ({ ...(isObject(prev) ? prev : {}), ...patch }));
      }
    } catch (e) { logError('hook:useWorkoutDeload.populateDeloadSuggestions', e) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportHistory, exercises]);


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
    } catch (e) { logError('hook:useWorkoutDeload.persistDeloadHistory', e) }
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
      logError('hook:useWorkoutDeload.resolveAiSuggestion', err);
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
    } catch {
      return { ok: false, error: 'Falha ao analisar histórico.' };
    }
  };


  const openDeloadModal = async (ex: WorkoutExercise, exIdx: number): Promise<void> => {
    const totalTimeoutMs = REPORT_FETCH_TIMEOUT_MS + AI_SUGGESTION_TIMEOUT_MS + 3000;
    try {
      await withTimeout(
        (async () => {
          let ok = false;
          try {
            ok = typeof confirm === 'function'
              ? await confirm('Deseja analisar deload para este exercício?', 'Aplicar Deload')
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
    } catch {
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
    } catch {
      try {
        await alert('Não foi possível aplicar o deload agora.');
      } catch { }
    }
  };


  return {
    reportHistory,
    reportHistoryStatus,
    reportHistoryUpdatedAt,
    deloadSuggestions,
    deloadModal,
    setDeloadModal,
    deloadAiCacheRef,
    reportHistoryLoadingRef,
    reportHistoryLoadingSinceRef,
    reportHistoryStatusRef,
    reportHistoryUpdatedAtRef,
    buildExerciseHistoryEntry,
    persistDeloadHistoryFromSession,
    openDeloadModal,
    updateDeloadModalFromPercent,
    updateDeloadModalFromWeight,
    applyDeloadToExercise,
  };
}
