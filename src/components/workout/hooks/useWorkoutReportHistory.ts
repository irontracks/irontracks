import { useCallback, useEffect, useRef, useState } from 'react';
import { useStableSupabaseClient } from '@/hooks/useStableSupabaseClient';
import {
    readReportCache,
    writeReportCache,
    isObject,
    safeJsonParse,
    withTimeout,
    normalizeReportHistory,
    normalizeExerciseKey,
    averageNumbers,
    extractLogWeight,
    toNumber,
    toDateMs,
    REPORT_FETCH_TIMEOUT_MS,
    REPORT_HISTORY_LIMIT,
    DELOAD_HISTORY_SIZE,
} from '../utils';
import type { ReportHistory, ReportHistoryItem, UnknownRecord } from '../types';

type ReportHistoryStatus = { status: 'idle' | 'loading' | 'ready' | 'error'; error: string; source: string };

/**
 * useWorkoutReportHistory
 *
 * Fetches and caches workout history from Supabase for use in the
 * active workout screen (deload suggestions, AI recommendations, progress display).
 *
 * Includes:
 * - localStorage cache with TTL (15min)
 * - Network fetch with timeout
 * - Watchdog useEffect driven by ticker to detect stuck loading states
 */
export function useWorkoutReportHistory(ticker: number) {
    const supabase = useStableSupabaseClient();

    const [reportHistory, setReportHistory] = useState<ReportHistory>({ version: 1, exercises: {} });
    const [reportHistoryStatus, setReportHistoryStatus] = useState<ReportHistoryStatus>({ status: 'idle', error: '', source: '' });
    const [reportHistoryUpdatedAt, setReportHistoryUpdatedAt] = useState<number>(0);

    const reportHistoryLoadingRef = useRef<boolean>(false);
    const reportHistoryLoadingSinceRef = useRef<number>(0);
    const reportHistoryStatusRef = useRef<ReportHistoryStatus>({ status: 'idle', error: '', source: '' });
    const reportHistoryUpdatedAtRef = useRef<number>(0);

    // Sync refs with state
    useEffect(() => {
        reportHistoryStatusRef.current = reportHistoryStatus && typeof reportHistoryStatus === 'object'
            ? reportHistoryStatus
            : { status: 'idle', error: '', source: '' };
    }, [reportHistoryStatus]);

    useEffect(() => {
        reportHistoryUpdatedAtRef.current = Number(reportHistoryUpdatedAt || 0);
    }, [reportHistoryUpdatedAt]);

    // Build exercise history entry from raw session logs
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
                        if (hasValues) sets.push({ weight, reps });
                    } catch { }
                });
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
                const ts =
                    toDateMs(base.date) ??
                    toDateMs(base.completed_at) ??
                    toDateMs(base.completedAt) ??
                    toDateMs(meta.date) ??
                    toDateMs(meta.created_at) ??
                    Date.now();
                return { ts, avgWeight: avgWeight ?? null, avgReps: avgReps ?? null, totalVolume: Number.isFinite(totalVolume) ? totalVolume : 0, topWeight, setsCount: sets.length };
            } catch {
                return null;
            }
        },
        [],
    );

    // Transform raw Supabase rows into structured report history
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

    // Main fetch effect — load from cache first, then network
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
                    REPORT_FETCH_TIMEOUT_MS,
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

    // Watchdog: driven by ticker to detect stuck loading states
    useEffect(() => {
        try {
            const statusObj = reportHistoryStatusRef.current && typeof reportHistoryStatusRef.current === 'object'
                ? reportHistoryStatusRef.current
                : { status: 'idle' };
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

    return {
        reportHistory,
        setReportHistory,
        reportHistoryStatus,
        reportHistoryUpdatedAt,
        buildReportHistoryFromWorkouts,
    };
}
