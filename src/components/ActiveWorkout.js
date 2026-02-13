"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Check, ChevronDown, ChevronUp, Clock, Dumbbell, GripVertical, Link2, Loader2, MessageSquare, Pencil, Play, Plus, Save, UserPlus, X } from 'lucide-react';
import { Reorder, useDragControls } from 'framer-motion';
import { useDialog } from '@/contexts/DialogContext';
import { BackButton } from '@/components/ui/BackButton';
import { parseTrainingNumber } from '@/utils/trainingNumber';
import InviteManager from '@/components/InviteManager';
import { useTeamWorkout } from '@/contexts/TeamWorkoutContext';
import { queueFinishWorkout, isOnline } from '@/lib/offline/offlineSync';
import { applyExerciseOrder, buildExerciseDraft, draftOrderKeys, moveDraftItem } from '@/lib/workoutReorder';
import ExecutionVideoCapture from '@/components/ExecutionVideoCapture';
import { createClient } from '@/utils/supabase/client';
import { generatePostWorkoutInsights } from '@/actions/workout-actions';

const isObject = (v) => v && typeof v === 'object' && !Array.isArray(v);

const isClusterConfig = (cfg) => {
  if (!isObject(cfg)) return false;
  const hasClusterSize = cfg.cluster_size != null;
  const hasIntra = cfg.intra_rest_sec != null;
  const hasTotal = cfg.total_reps != null;
  return (hasClusterSize && hasIntra) || (hasClusterSize && hasTotal) || (hasIntra && hasTotal);
};

const isRestPauseConfig = (cfg) => {
  if (!isObject(cfg)) return false;
  const hasMiniSets = cfg.mini_sets != null;
  const hasRest = cfg.rest_time_sec != null;
  const hasInitial = cfg.initial_reps != null;
  return (hasMiniSets && hasRest) || (hasMiniSets && hasInitial) || (hasRest && hasInitial);
};

const buildPlannedBlocks = (totalReps, clusterSize) => {
  const t = Number(totalReps);
  const c = Number(clusterSize);
  if (!Number.isFinite(t) || t <= 0) return [];
  if (!Number.isFinite(c) || c <= 0) return [];
  const blocks = [];
  let remaining = t;
  while (remaining > 0) {
    const next = Math.min(c, remaining);
    blocks.push(next);
    remaining -= next;
    if (blocks.length > 50) break;
  }
  return blocks;
};

const buildBlocksByCount = (totalReps, blocksCount) => {
  const t = Number(totalReps);
  const c = Number(blocksCount);
  if (!Number.isFinite(t) || t <= 0) return [];
  if (!Number.isFinite(c) || c <= 0) return [];
  const count = Math.min(50, Math.round(c));
  const base = Math.floor(t / count);
  const remainder = t - base * count;
  if (base <= 0) return [];
  const blocks = Array.from({ length: count }).map((_, idx) => base + (idx < remainder ? 1 : 0));
  return blocks.filter((n) => Number.isFinite(n) && n > 0);
};

const DELOAD_HISTORY_KEY = 'irontracks.deload.history.v1';
const DELOAD_AUDIT_KEY = 'irontracks.deload.audit.v1';
const DELOAD_HISTORY_SIZE = 6;
const DELOAD_HISTORY_MIN = 4;
const DELOAD_RECENT_WINDOW = 3;
const DELOAD_STAGNATION_PCT = 0.02;
const DELOAD_REGRESSION_PCT = 0.03;
const DELOAD_REDUCTION_STABLE = 0.12;
const DELOAD_REDUCTION_STAGNATION = 0.15;
const DELOAD_REDUCTION_OVERTRAIN = 0.22;
const DELOAD_MIN_1RM_FACTOR = 0.5;
const DELOAD_REDUCTION_MIN = 0.05;
const DELOAD_REDUCTION_MAX = 0.4;
const WEIGHT_ROUND_STEP = 0.5;
const REPORT_HISTORY_LIMIT = 80;
const REPORT_CACHE_KEY = 'irontracks.report.history.v1';
const REPORT_CACHE_TTL_MS = 1000 * 60 * 15;
const REPORT_FETCH_TIMEOUT_MS = 9000;
const DELOAD_SUGGEST_MODE = 'watermark';
const DEFAULT_SUGGESTED_RPE = 8;
const AI_SUGGESTION_MIN_HISTORY = 2;
const AI_SUGGESTION_TIMEOUT_MS = 8000;
const DROPSET_STAGE_LIMIT = 20;

const toNumber = (v) => {
  const raw = String(v ?? '').replace(',', '.');
  const match = raw.match(/-?\d+(?:\.\d+)?/);
  const n = Number(match ? match[0] : '');
  return Number.isFinite(n) ? n : null;
};

const safeJsonParse = (raw) => {
  try {
    if (!raw) return null;
    if (typeof raw === 'object') return raw;
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
};

const toDateMs = (value) => {
  try {
    const t = new Date(value || 0).getTime();
    return Number.isFinite(t) ? t : null;
  } catch {
    return null;
  }
};

const averageNumbers = (list) => {
  const arr = Array.isArray(list) ? list.filter((v) => Number.isFinite(Number(v))) : [];
  if (!arr.length) return null;
  const total = arr.reduce((acc, v) => acc + Number(v || 0), 0);
  return total / arr.length;
};

const extractLogWeight = (log) => {
  const base = log && typeof log === 'object' ? log : {};
  const direct = toNumber(base?.weight ?? null);
  if (direct != null && direct > 0) return direct;
  const dropStages = Array.isArray(base?.drop_set?.stages) ? base.drop_set.stages : [];
  const dropWeight = averageNumbers(dropStages.map((s) => toNumber(s?.weight)).filter((v) => Number.isFinite(Number(v)) && Number(v) > 0));
  if (dropWeight != null && dropWeight > 0) return dropWeight;
  const clusterBlocks = Array.isArray(base?.cluster?.blocksDetailed) ? base.cluster.blocksDetailed : [];
  const clusterWeight = averageNumbers(clusterBlocks.map((b) => toNumber(b?.weight)).filter((v) => Number.isFinite(Number(v)) && Number(v) > 0));
  if (clusterWeight != null && clusterWeight > 0) return clusterWeight;
  const restPauseWeight = toNumber(base?.rest_pause?.weight ?? null);
  if (restPauseWeight != null && restPauseWeight > 0) return restPauseWeight;
  return null;
};

const withTimeout = async (promise, ms) => {
  let timeoutId;
  try {
    const timeout = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('timeout')), ms);
    });
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timeoutId);
  }
};

const normalizeReportHistory = (data) => {
  const base = data && typeof data === 'object' ? data : {};
  const exercises = base?.exercises && typeof base.exercises === 'object' ? base.exercises : {};
  return { version: 1, exercises };
};

const readReportCache = () => {
  try {
    const win = typeof window !== 'undefined' ? window : null;
    if (!win || !win.localStorage) return null;
    const raw = win.localStorage.getItem(REPORT_CACHE_KEY);
    if (!raw) return null;
    const parsed = safeJsonParse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const cachedAt = Number(parsed?.cachedAt || 0);
    const data = normalizeReportHistory(parsed?.data ?? null);
    if (!cachedAt || !data) return null;
    const age = Date.now() - cachedAt;
    return { data, cachedAt, stale: Number.isFinite(age) ? age > REPORT_CACHE_TTL_MS : true };
  } catch {
    return null;
  }
};

const writeReportCache = (data) => {
  try {
    const win = typeof window !== 'undefined' ? window : null;
    if (!win || !win.localStorage) return;
    const payload = { cachedAt: Date.now(), data: normalizeReportHistory(data) };
    win.localStorage.setItem(REPORT_CACHE_KEY, JSON.stringify(payload));
  } catch {}
};

const clampNumber = (value, min, max) => {
  const v = Number(value);
  if (!Number.isFinite(v)) return min;
  return Math.min(max, Math.max(min, v));
};

const roundToStep = (value, step) => {
  const v = Number(value);
  const s = Number(step);
  if (!Number.isFinite(v) || !Number.isFinite(s) || s <= 0) return v;
  return Math.round(v / s) * s;
};

const normalizeExerciseKey = (name) => String(name || '').trim().toLowerCase();

const estimate1Rm = (weight, reps) => {
  const w = Number(weight);
  const r = Number(reps);
  if (!Number.isFinite(w) || !Number.isFinite(r) || w <= 0 || r <= 0) return null;
  return w * (1 + r / 30);
};

export default function ActiveWorkout(props) {
  const { alert, confirm } = useDialog();
  const { sendInvite } = useTeamWorkout();
  const session = props?.session && typeof props.session === 'object' ? props.session : null;
  const workout = session?.workout && typeof session.workout === 'object' ? session.workout : null;
  const exercises = useMemo(() => (Array.isArray(workout?.exercises) ? workout.exercises : []), [workout?.exercises]);
  const logs = session?.logs && typeof session.logs === 'object' ? session.logs : {};
  const ui = session?.ui && typeof session.ui === 'object' ? session.ui : {};
  const settings = props?.settings && typeof props.settings === 'object' ? props.settings : null;

  const [ticker, setTicker] = useState(Date.now());
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [finishing, setFinishing] = useState(false);
  const [openNotesKeys, setOpenNotesKeys] = useState(() => new Set());
  const [inviteOpen, setInviteOpen] = useState(false);
  const [addExerciseOpen, setAddExerciseOpen] = useState(false);
  const [addExerciseDraft, setAddExerciseDraft] = useState(() => ({
    name: '',
    sets: '3',
    restTime: '60',
  }));
  const [organizeOpen, setOrganizeOpen] = useState(false);
  const [organizeDraft, setOrganizeDraft] = useState([]);
  const [organizeSaving, setOrganizeSaving] = useState(false);
  const [organizeError, setOrganizeError] = useState('');
  const [deloadModal, setDeloadModal] = useState(null);
  const [clusterModal, setClusterModal] = useState(null);
  const [restPauseModal, setRestPauseModal] = useState(null);
  const [dropSetModal, setDropSetModal] = useState(null);
  const [postCheckinOpen, setPostCheckinOpen] = useState(false);
  const [postCheckinDraft, setPostCheckinDraft] = useState({ rpe: '', satisfaction: '', soreness: '', notes: '' });
  const postCheckinResolveRef = useRef(null);
  const [reportHistory, setReportHistory] = useState({ version: 1, exercises: {} });
  const [reportHistoryStatus, setReportHistoryStatus] = useState({ status: 'idle', error: '', source: '' });
  const [reportHistoryUpdatedAt, setReportHistoryUpdatedAt] = useState(0);
  const [deloadSuggestions, setDeloadSuggestions] = useState({});
  const [timerMinimized, setTimerMinimized] = useState(false);
  const [currentExerciseIdx, setCurrentExerciseIdx] = useState(0);

  const restPauseRefs = useRef({});
  const clusterRefs = useRef({});
  const organizeBaseKeysRef = useRef([]);
  const reportHistoryLoadingRef = useRef(false);
  const reportHistoryLoadingSinceRef = useRef(0);
  const reportHistoryStatusRef = useRef({ status: 'idle', error: '', source: '' });
  const reportHistoryUpdatedAtRef = useRef(0);
  const deloadAiCacheRef = useRef({});
  const supabase = useMemo(() => {
    try {
      return createClient();
    } catch {
      return null;
    }
  }, []);
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

  useEffect(() => {
    try {
      const list = Array.isArray(exercises) ? exercises : [];
      const withVideo = list.filter((ex) => String(ex?.videoUrl ?? ex?.video_url ?? '').trim()).length;
      const withObs = list.filter((ex) => String(ex?.notes ?? '').trim()).length;
      console.debug('[ActiveWorkout] exercise media snapshot', { total: list.length, withVideo, withObs });
    } catch (e) {
      console.error('[ActiveWorkout] exercise media snapshot failed', e);
    }
  }, [exercises]);

  const organizeDirty = useMemo(() => {
    const baseKeys = Array.isArray(organizeBaseKeysRef.current) ? organizeBaseKeysRef.current : [];
    const draftKeys = draftOrderKeys(organizeDraft);
    if (draftKeys.length !== baseKeys.length) return true;
    for (let i = 0; i < draftKeys.length; i += 1) {
      if (draftKeys[i] !== baseKeys[i]) return true;
    }
    return false;
  }, [organizeDraft]);

  const startedAtMs = useMemo(() => {
    const raw = session?.startedAt;
    if (typeof raw === 'number') return raw;
    const t = new Date(raw || 0).getTime();
    return Number.isFinite(t) ? t : 0;
  }, [session?.startedAt]);

  const elapsedSeconds = useMemo(() => {
    if (!startedAtMs) return 0;
    return Math.max(0, Math.floor((ticker - startedAtMs) / 1000));
  }, [ticker, startedAtMs]);

  const currentExercise = useMemo(() => {
    const list = Array.isArray(exercises) ? exercises : [];
    const idxRaw = Number(currentExerciseIdx);
    const safeIdx = Number.isFinite(idxRaw) ? Math.min(Math.max(idxRaw, 0), Math.max(list.length - 1, 0)) : 0;
    const ex = list[safeIdx] && typeof list[safeIdx] === 'object' ? list[safeIdx] : {};
    const name = String(ex?.name || '').trim() || `Exercício ${safeIdx + 1}`;
    const rest = parseTrainingNumber(ex?.restTime ?? ex?.rest_time);
    return { idx: safeIdx, name, rest };
  }, [exercises, currentExerciseIdx]);

  const formatElapsed = (s) => {
    const secs = Math.max(0, Number(s) || 0);
    const m = Math.floor(secs / 60);
    const sec = secs % 60;
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  const requestPostWorkoutCheckin = async () => {
    if (postCheckinOpen) return null;
    return await new Promise((resolve) => {
      postCheckinResolveRef.current = (value) => {
        resolve(value ?? null);
      };
      setPostCheckinDraft({ rpe: '', satisfaction: '', soreness: '', notes: '' });
      setPostCheckinOpen(true);
    });
  };

  const safeUpdateSessionUi = (patch) => {
    try {
      if (typeof props?.onUpdateSession !== 'function') return;
      const baseUi = session?.ui && typeof session.ui === 'object' ? session.ui : {};
      props.onUpdateSession({ ui: { ...baseUi, ...(patch && typeof patch === 'object' ? patch : {}) } });
    } catch {}
  };

  useEffect(() => {
    try {
      const focus = ui?.restPauseFocus && typeof ui.restPauseFocus === 'object' ? ui.restPauseFocus : null;
      const key = String(focus?.key ?? '').trim();
      const miniIndex = Number(focus?.miniIndex);
      if (!key) return;
      if (!Number.isFinite(miniIndex) || miniIndex < 0) return;
      const input = restPauseRefs.current?.[key]?.[miniIndex];
      if (input && typeof input.focus === 'function') {
        input.focus();
        try {
          input.select?.();
        } catch {}
      }
      safeUpdateSessionUi({ restPauseFocus: null });
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ui?.restPauseFocus?.key, ui?.restPauseFocus?.miniIndex]);

  useEffect(() => {
    try {
      const focus = ui?.clusterFocus && typeof ui.clusterFocus === 'object' ? ui.clusterFocus : null;
      const key = String(focus?.key ?? '').trim();
      const blockIndex = Number(focus?.blockIndex);
      if (!key) return;
      if (!Number.isFinite(blockIndex) || blockIndex < 0) return;
      const input = clusterRefs.current?.[key]?.[blockIndex];
      if (input && typeof input.focus === 'function') {
        input.focus();
        try {
          input.select?.();
        } catch {}
      }
      safeUpdateSessionUi({ clusterFocus: null });
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ui?.clusterFocus?.key, ui?.clusterFocus?.blockIndex]);

  const getPlanConfig = (ex, setIdx) => {
    const sdArr = Array.isArray(ex?.setDetails) ? ex.setDetails : Array.isArray(ex?.set_details) ? ex.set_details : [];
    const sd = sdArr?.[setIdx] && typeof sdArr[setIdx] === 'object' ? sdArr[setIdx] : null;
    const cfg = sd?.advanced_config ?? sd?.advancedConfig ?? null;
    return isObject(cfg) ? cfg : null;
  };

  const getPlannedSet = (ex, setIdx) => {
    const sdArr = Array.isArray(ex?.setDetails) ? ex.setDetails : Array.isArray(ex?.set_details) ? ex.set_details : [];
    const sd = sdArr?.[setIdx] && typeof sdArr[setIdx] === 'object' ? sdArr[setIdx] : null;
    return sd && typeof sd === 'object' ? sd : null;
  };

  const getLog = (key) => {
    const v = logs?.[key];
    return v && typeof v === 'object' ? v : {};
  };

  const buildExerciseHistoryEntryFromSessionLogs = useCallback((sessionObj, exIdx, meta) => {
    try {
      const base = sessionObj && typeof sessionObj === 'object' ? sessionObj : null;
      if (!base) return null;
      const logsObj = base?.logs && typeof base.logs === 'object' ? base.logs : {};
      const sets = [];
      Object.entries(logsObj).forEach(([key, value]) => {
        try {
          const parts = String(key || '').split('-');
          const eIdx = Number(parts[0]);
          if (!Number.isFinite(eIdx) || eIdx !== exIdx) return;
          const log = value && typeof value === 'object' ? value : null;
          if (!log) return;
          const weight = extractLogWeight(log);
          const reps = toNumber(log?.reps ?? null);
          const hasValues = weight != null || reps != null;
          const doneRaw = log?.done ?? log?.isDone ?? log?.completed ?? null;
          const done = doneRaw == null ? true : doneRaw === true || String(doneRaw || '').toLowerCase() === 'true';
          if (!done && !hasValues) return;
          if (hasValues) {
            sets.push({ weight, reps });
          }
        } catch {}
      });
      if (!sets.length) return null;
      const weightList = sets.map((s) => s?.weight).filter((v) => Number.isFinite(Number(v)) && Number(v) > 0);
      const repsList = sets.map((s) => s?.reps).filter((v) => Number.isFinite(Number(v)) && Number(v) > 0);
      const avgWeight = averageNumbers(weightList);
      const avgReps = averageNumbers(repsList);
      const totalVolume = sets.reduce((acc, s) => {
        const w = Number(s?.weight ?? 0);
        const r = Number(s?.reps ?? 0);
        if (!Number.isFinite(w) || !Number.isFinite(r)) return acc;
        if (w <= 0 || r <= 0) return acc;
        return acc + w * r;
      }, 0);
      const topWeight = weightList.length ? Math.max(...weightList) : null;
      if (!avgWeight && !avgReps && !totalVolume) return null;
      const ts =
        toDateMs(base?.date) ??
        toDateMs(base?.completed_at) ??
        toDateMs(base?.completedAt) ??
        toDateMs(meta?.date) ??
        toDateMs(meta?.created_at) ??
        Date.now();
      return {
        ts,
        avgWeight: avgWeight ?? null,
        avgReps: avgReps ?? null,
        totalVolume: Number.isFinite(totalVolume) ? totalVolume : 0,
        topWeight: topWeight ?? null,
        setsCount: sets.length,
      };
    } catch {
      return null;
    }
  }, []);

  const buildReportHistoryFromWorkouts = useCallback((rows) => {
    try {
      const list = Array.isArray(rows) ? rows : [];
      const next = { version: 1, exercises: {} };
      list.forEach((row) => {
        const sessionObj = safeJsonParse(row?.notes);
        if (!sessionObj || typeof sessionObj !== 'object') return;
        const exercisesArr = Array.isArray(sessionObj?.exercises) ? sessionObj.exercises : [];
        if (!exercisesArr.length) return;
        exercisesArr.forEach((ex, exIdx) => {
          const name = String(ex?.name || '').trim();
          if (!name) return;
          const key = normalizeExerciseKey(name);
          if (!key) return;
          const entry = buildExerciseHistoryEntryFromSessionLogs(sessionObj, exIdx, row);
          if (!entry) return;
          const prev = next.exercises?.[key] && typeof next.exercises[key] === 'object' ? next.exercises[key] : { name, items: [] };
          const items = Array.isArray(prev?.items) ? prev.items : [];
          next.exercises[key] = { name, items: [...items, { ...entry, name }] };
        });
      });
      Object.keys(next.exercises).forEach((key) => {
        const ex = next.exercises[key];
        const items = Array.isArray(ex?.items) ? ex.items : [];
        const ordered = items
          .filter((it) => it && typeof it === 'object')
          .sort((a, b) => Number(a?.ts || 0) - Number(b?.ts || 0))
          .slice(-DELOAD_HISTORY_SIZE);
        next.exercises[key] = { ...ex, items: ordered };
      });
      return next;
    } catch {
      return { version: 1, exercises: {} };
    }
  }, [buildExerciseHistoryEntryFromSessionLogs]);

  useEffect(() => {
    let cancelled = false;
    let loadingTimeoutId;
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

  const updateLog = (key, patch) => {
    try {
      if (typeof props?.onUpdateLog !== 'function') return;
      const prev = getLog(key);
      props.onUpdateLog(key, { ...prev, ...(patch && typeof patch === 'object' ? patch : {}) });
    } catch {}
  };

  const saveClusterModal = () => {
    try {
      const m = clusterModal && typeof clusterModal === 'object' ? clusterModal : null;
      const key = String(m?.key || '').trim();
      if (!key) {
        setClusterModal((prev) => (prev && typeof prev === 'object' ? { ...prev, error: 'Série inválida. Feche e abra novamente.' } : prev));
        return;
      }
      const blocks = Array.isArray(m?.blocks) ? m.blocks : [];
      if (!blocks.length) {
        setClusterModal((prev) =>
          prev && typeof prev === 'object'
            ? { ...prev, error: 'Nenhum bloco encontrado. Verifique a configuração (total reps, cluster size e descanso).' }
            : prev,
        );
        return;
      }
      const planned = m?.planned && typeof m.planned === 'object' ? m.planned : {};
      const intra = Number(m?.intra);
      const restsByGap = Array.isArray(m?.restsByGap) ? m.restsByGap : [];
      const done = !!getLog(key)?.done;
      const baseAdvanced = m?.cfg ?? getLog(key)?.advanced_config ?? null;

      const blocksDetailed = [];
      const repsBlocks = [];
      let total = 0;
      for (let i = 0; i < blocks.length; i += 1) {
        const b = blocks[i] && typeof blocks[i] === 'object' ? blocks[i] : {};
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
        const gapRest = restsByGap?.[i];
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
            total_reps: planned?.total_reps ?? null,
            cluster_size: planned?.cluster_size ?? null,
            cluster_blocks_count: planned?.cluster_blocks_count ?? null,
            intra_rest_sec: planned?.intra_rest_sec ?? null,
          },
          plannedBlocks: Array.isArray(m?.plannedBlocks) ? m.plannedBlocks : null,
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
      const m = restPauseModal && typeof restPauseModal === 'object' ? restPauseModal : null;
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

      const minis = Array.isArray(m?.minis) ? m.minis : [];
      const miniReps = minis.map((v) => {
        const n = parseTrainingNumber(v);
        return n != null && n > 0 ? n : null;
      });
      if (miniReps.some((v) => v == null)) {
        setRestPauseModal((prev) => (prev && typeof prev === 'object' ? { ...prev, error: 'Preencha as reps de todos os minis.' } : prev));
        return;
      }

      const pauseSec = parseTrainingNumber(m?.pauseSec) ?? 15;
      const rpe = String(m?.rpe ?? '').trim();
      const cfg = m?.cfg ?? getLog(key)?.advanced_config ?? null;

      const total = (activationReps ?? 0) + miniReps.reduce((acc, v) => acc + (v ?? 0), 0);
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

      const stages = [];
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

  const loadDeloadHistory = () => {
    try {
      if (typeof window === 'undefined') return { version: 1, exercises: {} };
      const raw = window.localStorage.getItem(DELOAD_HISTORY_KEY);
      if (!raw) return { version: 1, exercises: {} };
      const parsed = JSON.parse(raw);
      const exercises = parsed?.exercises && typeof parsed.exercises === 'object' ? parsed.exercises : {};
      return { version: 1, ...(parsed && typeof parsed === 'object' ? parsed : {}), exercises };
    } catch {
      return { version: 1, exercises: {} };
    }
  };

  const saveDeloadHistory = (next) => {
    try {
      if (typeof window === 'undefined') return;
      window.localStorage.setItem(DELOAD_HISTORY_KEY, JSON.stringify(next));
    } catch {}
  };

  const appendDeloadAudit = (entry) => {
    try {
      if (typeof window === 'undefined') return;
      const raw = window.localStorage.getItem(DELOAD_AUDIT_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      const list = Array.isArray(parsed) ? parsed : [];
      const next = [entry, ...list].slice(0, 100);
      window.localStorage.setItem(DELOAD_AUDIT_KEY, JSON.stringify(next));
    } catch {}
  };

  const collectExerciseSetInputs = (ex, exIdx) => {
    const setsHeader = Math.max(0, Number.parseInt(String(ex?.sets ?? '0'), 10) || 0);
    const sdArr = Array.isArray(ex?.setDetails) ? ex.setDetails : Array.isArray(ex?.set_details) ? ex.set_details : [];
    const setsCount = Math.max(setsHeader, Array.isArray(sdArr) ? sdArr.length : 0);
    const sets = [];
    for (let setIdx = 0; setIdx < setsCount; setIdx += 1) {
      const key = `${exIdx}-${setIdx}`;
      const log = getLog(key);
      const cfg = getPlanConfig(ex, setIdx);
      const planned = getPlannedSet(ex, setIdx);
      const logWeight = extractLogWeight(log);
      const fallbackWeight = toNumber(cfg?.weight ?? planned?.weight ?? null);
      const weight = logWeight != null ? logWeight : fallbackWeight;
      const reps = toNumber(log?.reps ?? planned?.reps ?? ex?.reps ?? null);
      if (weight != null || reps != null) {
        sets.push({ weight, reps });
      }
    }
    return { setsCount, sets };
  };

  const collectExercisePlannedInputs = (ex, exIdx) => {
    const setsHeader = Math.max(0, Number.parseInt(String(ex?.sets ?? '0'), 10) || 0);
    const sdArr = Array.isArray(ex?.setDetails) ? ex.setDetails : Array.isArray(ex?.set_details) ? ex.set_details : [];
    const setsCount = Math.max(setsHeader, Array.isArray(sdArr) ? sdArr.length : 0);
    const sets = [];
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

  const buildExerciseHistoryEntry = (ex, exIdx) => {
    const { sets } = collectExerciseSetInputs(ex, exIdx);
    if (!sets.length) return null;
    const weightList = sets.map((s) => s?.weight).filter((v) => Number.isFinite(Number(v)) && Number(v) > 0);
    const repsList = sets.map((s) => s?.reps).filter((v) => Number.isFinite(Number(v)) && Number(v) > 0);
    const avgWeight = averageNumbers(weightList);
    const avgReps = averageNumbers(repsList);
    const totalVolume = sets.reduce((acc, s) => {
      const w = Number(s?.weight ?? 0);
      const r = Number(s?.reps ?? 0);
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

  const analyzeDeloadHistory = (items) => {
    const ordered = Array.isArray(items) ? items.slice(-DELOAD_HISTORY_SIZE) : [];
    const recent = ordered.slice(-DELOAD_RECENT_WINDOW);
    const older = ordered.slice(0, Math.max(0, ordered.length - recent.length));
    const avgRecentVolume = averageNumbers(recent.map((i) => i?.totalVolume).filter((v) => Number.isFinite(Number(v)) && Number(v) > 0));
    const avgOlderVolume = averageNumbers(older.map((i) => i?.totalVolume).filter((v) => Number.isFinite(Number(v)) && Number(v) > 0));
    const avgRecentWeight = averageNumbers(recent.map((i) => i?.avgWeight).filter((v) => Number.isFinite(Number(v)) && Number(v) > 0));
    const avgOlderWeight = averageNumbers(older.map((i) => i?.avgWeight).filter((v) => Number.isFinite(Number(v)) && Number(v) > 0));

    const volumeDelta = avgOlderVolume && avgRecentVolume ? (avgRecentVolume - avgOlderVolume) / avgOlderVolume : null;
    const weightDelta = avgOlderWeight && avgRecentWeight ? (avgRecentWeight - avgOlderWeight) / avgOlderWeight : null;

    const hasRegression =
      (volumeDelta != null && volumeDelta <= -DELOAD_REGRESSION_PCT) ||
      (weightDelta != null && weightDelta <= -DELOAD_REGRESSION_PCT);
    const hasStagnation =
      (!hasRegression && volumeDelta != null && Math.abs(volumeDelta) <= DELOAD_STAGNATION_PCT) ||
      (!hasRegression && weightDelta != null && Math.abs(weightDelta) <= DELOAD_STAGNATION_PCT);

    const status = hasRegression ? 'overtraining' : hasStagnation ? 'stagnation' : 'stable';
    return { status, volumeDelta, weightDelta };
  };

  const parseAiRecommendation = (text) => {
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

  const buildDeloadSetSuggestions = (ex, exIdx) => {
    try {
      const name = String(ex?.name || '').trim() || `Exercício ${exIdx + 1}`;
      const key = normalizeExerciseKey(name);
      const history = loadDeloadHistory();
      const items = Array.isArray(history?.exercises?.[key]?.items) ? history.exercises[key].items : [];
      const reportItems = Array.isArray(reportHistory?.exercises?.[key]?.items) ? reportHistory.exercises[key].items : [];
      const preferredItems = reportItems.length ? reportItems : items;
      const ordered = preferredItems
        .filter((it) => it && typeof it === 'object')
        .sort((a, b) => Number(a?.ts || 0) - Number(b?.ts || 0));
      const latest = ordered.length ? ordered[ordered.length - 1] : null;
      const latestAvgWeight = toNumber(latest?.avgWeight ?? null);
      const latestAvgReps = toNumber(latest?.avgReps ?? null);
      const baseSuggestion = buildDeloadSuggestion(ex, exIdx);
      const baseWeight = baseSuggestion?.ok ? Number(baseSuggestion.baseWeight || 0) : latestAvgWeight ?? null;
      const suggestedWeight = baseSuggestion?.ok ? Number(baseSuggestion.suggestedWeight || 0) : baseWeight ?? null;
      const minWeight = baseSuggestion?.ok ? Number(baseSuggestion.minWeight || 0) : 0;
      const ratio = baseWeight && suggestedWeight ? suggestedWeight / baseWeight : 1;
      const { setsCount } = collectExerciseSetInputs(ex, exIdx);
      const entries = {};
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
      const result = {
        ok: hasEntries,
        name,
        key,
        entries,
        itemsCount: preferredItems.length,
        baseSuggestion: baseSuggestion?.ok ? baseSuggestion : null,
      };
      try {
        console.info('[Deload] draft', {
          exIdx,
          name,
          ok: result.ok,
          itemsCount: result.itemsCount,
          entriesCount: Object.keys(entries).length,
          baseSuggestion: !!result.baseSuggestion,
        });
      } catch {}
      return result;
    } catch (e) {
      try {
        console.warn('[Deload] draft failed', e?.message ? String(e.message) : String(e));
      } catch {}
      return { ok: false, error: 'Falha ao analisar histórico.' };
    }
  };

  const estimate1RmFromSets = (sets, historyItems) => {
    const candidates = [];
    const list = Array.isArray(sets) ? sets : [];
    list.forEach((s) => {
      const w = Number(s?.weight ?? 0);
      const r = Number(s?.reps ?? 0);
      const est = estimate1Rm(w, r);
      if (est) candidates.push(est);
    });
    const hist = Array.isArray(historyItems) ? historyItems : [];
    hist.forEach((h) => {
      const est = estimate1Rm(h?.topWeight ?? null, h?.avgReps ?? null);
      if (est) candidates.push(est);
    });
    if (!candidates.length) return null;
    return Math.max(...candidates);
  };

  const buildDeloadSuggestion = (ex, exIdx, aiSuggestion) => {
    const name = String(ex?.name || '').trim() || `Exercício ${exIdx + 1}`;
    const key = normalizeExerciseKey(name);
    const history = loadDeloadHistory();
    const items = Array.isArray(history?.exercises?.[key]?.items) ? history.exercises[key].items : [];
    const reportItems = Array.isArray(reportHistory?.exercises?.[key]?.items) ? reportHistory.exercises[key].items : [];
    const preferredItems = reportItems.length ? reportItems : items;
    const currentInputs = collectExerciseSetInputs(ex, exIdx);
    const currentSets = Array.isArray(currentInputs?.sets) ? currentInputs.sets : [];
    const historyCount = preferredItems.length ? preferredItems.length : currentSets.length ? 1 : 0;
    const plannedInputs = collectExercisePlannedInputs(ex, exIdx);
    const plannedSets = Array.isArray(plannedInputs?.sets) ? plannedInputs.sets : [];
    const baseWeightFromHistory = averageNumbers(preferredItems.map((i) => i?.avgWeight).filter((v) => Number.isFinite(Number(v)) && Number(v) > 0));
    const baseWeightFromCurrent = averageNumbers(currentSets.map((s) => s?.weight).filter((v) => Number.isFinite(Number(v)) && Number(v) > 0));
    const baseWeightFromPlan = averageNumbers(plannedSets.map((s) => s?.weight).filter((v) => Number.isFinite(Number(v)) && Number(v) > 0));
    const baseWeightFromAi = (() => {
      const v = toNumber(aiSuggestion?.weight ?? null);
      return v != null && v > 0 ? v : null;
    })();
    const baseWeight = baseWeightFromHistory ?? baseWeightFromCurrent ?? baseWeightFromPlan ?? baseWeightFromAi ?? null;
    if (!baseWeight || !Number.isFinite(Number(baseWeight)) || Number(baseWeight) <= 0) {
      try {
        console.warn('[Deload] base weight missing', {
          exIdx,
          name,
          historyCount,
          baseWeightFromHistory,
          baseWeightFromCurrent,
          baseWeightFromPlan,
          baseWeightFromAi,
        });
      } catch {}
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
    const result = {
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
    try {
      console.info('[Deload] suggestion', {
        exIdx,
        name,
        historyCount,
        baseWeight,
        suggestedWeight,
        appliedReduction,
        targetReduction,
        minWeight,
        status: analysis?.status,
      });
    } catch {}
    return result;
  };

  const getDeloadReason = (analysis, reductionPct, historyCount) => {
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

  const resolveAiSuggestionForExercise = async (exerciseName) => {
    try {
      const name = String(exerciseName || '').trim();
      if (!name) return null;
      const key = normalizeExerciseKey(name);
      const cache = deloadAiCacheRef.current && typeof deloadAiCacheRef.current === 'object' ? deloadAiCacheRef.current : {};
      if (cache[key] !== undefined) return cache[key] || null;
      if (!session || typeof session !== 'object') {
        deloadAiCacheRef.current = { ...cache, [key]: null };
        return null;
      }
      const res = await withTimeout(
        generatePostWorkoutInsights({
          workoutId: typeof session?.id === 'string' ? session.id : null,
          session,
        }),
        AI_SUGGESTION_TIMEOUT_MS,
      );
      if (!res?.ok || !res?.ai) {
        deloadAiCacheRef.current = { ...cache, [key]: null };
        return null;
      }
      const progression = Array.isArray(res?.ai?.progression) ? res.ai.progression : [];
      const match = progression.find((rec) => normalizeExerciseKey(rec?.exercise || '') === key);
      const parsed = parseAiRecommendation(match?.recommendation ?? '');
      const ai = { weight: parsed.weight ?? null, reps: parsed.reps ?? null, rpe: parsed.rpe ?? null };
      deloadAiCacheRef.current = { ...cache, [key]: ai };
      return ai;
    } catch (err) {
      const msg = err?.message ? String(err.message) : String(err || '');
      if (msg.toLowerCase().includes('timeout')) {
        console.warn('[Deload AI] timeout ao gerar sugestões');
      } else {
        console.warn('[Deload AI] falha ao gerar sugestões', msg);
      }
      return null;
    }
  };

  const openDeloadModal = async (ex, exIdx) => {
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
          const safeEx = ex && typeof ex === 'object' ? ex : null;
          const safeIdx = Number(exIdx);
          if (!safeEx || !Number.isFinite(safeIdx) || safeIdx < 0) {
            try {
              console.warn('[Deload] invalid exercise', { exIdx });
              await alert('Deload indisponível: exercício inválido.');
            } catch {}
            return;
          }
          const name = String(safeEx?.name || '').trim() || `Exercício ${safeIdx + 1}`;
          const { setsCount } = collectExerciseSetInputs(safeEx, safeIdx);
          if (!setsCount || setsCount <= 0) {
            try {
              console.warn('[Deload] no sets', { exIdx: safeIdx, name, setsCount });
              await alert('Deload indisponível: exercício sem séries configuradas.');
            } catch {}
            return;
          }
          try {
            console.info('[Deload] start', {
              exIdx: safeIdx,
              name,
              reportStatus: reportHistoryStatus?.status || 'idle',
              reportSource: reportHistoryStatus?.source || '',
              reportUpdatedAt: reportHistoryUpdatedAt || null,
            });
          } catch {}
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
          let mergedEntries = suggestionDraft?.entries && typeof suggestionDraft.entries === 'object' ? { ...suggestionDraft.entries } : null;
          let aiSuggestion = null;
          if (suggestionDraft?.ok && suggestionDraft.itemsCount >= AI_SUGGESTION_MIN_HISTORY) {
            aiSuggestion = await resolveAiSuggestionForExercise(suggestionDraft?.name || '');
            if (!aiSuggestion) {
              try {
                console.info('[Deload] ai suggestion unavailable', { exIdx: safeIdx, name });
              } catch {}
            }
            if (aiSuggestion && mergedEntries) {
              Object.keys(mergedEntries).forEach((k) => {
                const cur = mergedEntries[k] && typeof mergedEntries[k] === 'object' ? mergedEntries[k] : {};
                mergedEntries[k] = {
                  weight: aiSuggestion.weight != null ? aiSuggestion.weight : cur.weight ?? null,
                  reps: aiSuggestion.reps != null ? aiSuggestion.reps : cur.reps ?? null,
                  rpe: aiSuggestion.rpe != null ? aiSuggestion.rpe : cur.rpe ?? null,
                };
              });
            }
          }
          if (mergedEntries && Object.keys(mergedEntries).length) {
            setDeloadSuggestions((prev) => ({ ...(prev && typeof prev === 'object' ? prev : {}), ...mergedEntries }));
          }
          let suggestion = buildDeloadSuggestion(safeEx, safeIdx, aiSuggestion);
          if (!suggestion?.ok) {
            const missingWeight = String(suggestion?.error || '').toLowerCase().includes('sem carga');
            if (missingWeight && !aiSuggestion) {
              aiSuggestion = await resolveAiSuggestionForExercise(suggestionDraft?.name || name);
              if (aiSuggestion && mergedEntries) {
                Object.keys(mergedEntries).forEach((k) => {
                  const cur = mergedEntries[k] && typeof mergedEntries[k] === 'object' ? mergedEntries[k] : {};
                  mergedEntries[k] = {
                    weight: aiSuggestion.weight != null ? aiSuggestion.weight : cur.weight ?? null,
                    reps: aiSuggestion.reps != null ? aiSuggestion.reps : cur.reps ?? null,
                    rpe: aiSuggestion.rpe != null ? aiSuggestion.rpe : cur.rpe ?? null,
                  };
                });
                setDeloadSuggestions((prev) => ({ ...(prev && typeof prev === 'object' ? prev : {}), ...mergedEntries }));
              }
              suggestion = buildDeloadSuggestion(safeEx, safeIdx, aiSuggestion);
            }
          }
          if (!suggestion?.ok) {
            const baseError = suggestion?.error || suggestionDraft?.error || 'Sem dados suficientes para calcular o deload.';
            const baseErrorClean = String(baseError || '').replace(/^Deload indisponível:\s*/i, '');
            const reportMsg = reportHistoryStatus?.status === 'loading'
              ? 'Relatórios ainda carregando.'
              : reportHistoryStatus?.status === 'error'
                ? `Relatórios com erro: ${reportHistoryStatus?.error || 'falha desconhecida'}.`
                : '';
            const watermarkMsg = DELOAD_SUGGEST_MODE === 'watermark' && suggestionDraft?.ok
              ? 'Sugestões aplicadas em marca d’água. '
              : '';
            try {
              console.warn('[Deload] suggestion unavailable', {
                exIdx: safeIdx,
                name,
                baseError,
                reportStatus: reportHistoryStatus?.status || 'idle',
                reportError: reportHistoryStatus?.error || '',
              });
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
          try {
            console.info('[Deload] modal opened', {
              exIdx: safeIdx,
              name,
              baseWeight: suggestion.baseWeight,
              suggestedWeight: suggestion.suggestedWeight,
            });
          } catch {}
        })(),
        totalTimeoutMs,
      );
    } catch (e) {
      const msg = e?.message ? String(e.message) : String(e || 'timeout');
      try {
        console.warn('[Deload] flow timeout', { message: msg, ms: totalTimeoutMs, elapsed: Date.now() - startedAt });
        await alert('Tempo limite ao processar o Deload. Tente novamente em instantes.');
      } catch {}
    }
  };

  const updateDeloadModalFromPercent = (value) => {
    if (!deloadModal || typeof deloadModal !== 'object') return;
    const pct = clampNumber((toNumber(value) ?? 0) / 100, DELOAD_REDUCTION_MIN, DELOAD_REDUCTION_MAX);
    const baseWeight = Number(deloadModal.baseWeight || 0);
    if (!Number.isFinite(baseWeight) || baseWeight <= 0) return;
    const minWeight = Number(deloadModal.minWeight || 0);
    const suggestedRaw = baseWeight * (1 - pct);
    const suggestedWeight = roundToStep(Math.max(suggestedRaw, minWeight || 0), WEIGHT_ROUND_STEP);
    const appliedReduction = clampNumber(1 - suggestedWeight / baseWeight, 0, 1);
    setDeloadModal((prev) => (prev && typeof prev === 'object' ? { ...prev, reductionPct: appliedReduction, suggestedWeight } : prev));
  };

  const updateDeloadModalFromWeight = (value) => {
    if (!deloadModal || typeof deloadModal !== 'object') return;
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
    if (!deloadModal || typeof deloadModal !== 'object') return;
    const exIdx = Number(deloadModal?.exIdx);
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
      const appliedWeights = [];
      for (let setIdx = 0; setIdx < setsCount; setIdx += 1) {
        const key = `${exIdx}-${setIdx}`;
        const log = getLog(key);
        const cfg = getPlanConfig(ex, setIdx);
        const planned = getPlannedSet(ex, setIdx);
        const logWeight = extractLogWeight(log);
        const baseSetWeight = logWeight != null ? logWeight : toNumber(cfg?.weight ?? planned?.weight ?? baseWeight);
        if (!baseSetWeight || baseSetWeight <= 0) continue;
        const nextWeight = roundToStep(Math.max(baseSetWeight * ratio, minWeight || 0), WEIGHT_ROUND_STEP);
        const suggestion = deloadSuggestions?.[key] && typeof deloadSuggestions[key] === 'object' ? deloadSuggestions[key] : null;
        const currentReps = log?.reps;
        const currentRpe = log?.rpe;
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
          advanced_config: cfg ?? log?.advanced_config ?? null,
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
    } catch (e) {
      try {
        await alert('Não foi possível aplicar o deload agora.');
      } catch {}
    }
  };

  const startTimer = (seconds, context) => {
    try {
      if (typeof props?.onStartTimer !== 'function') return;
      const s = Number(seconds);
      if (!Number.isFinite(s) || s <= 0) return;
      props.onStartTimer(s, context);
    } catch {}
  };

  const toggleCollapse = (exIdx) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(exIdx)) next.delete(exIdx);
      else next.add(exIdx);
      return next;
    });
  };

  const addExtraSetToExercise = async (exIdx) => {
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
    } catch (e) {
      try {
        await alert('Não foi possível adicionar série extra: ' + (e?.message || String(e || '')));
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
    const restTime = Number.isFinite(rest) && rest > 0 ? rest : null;
    const nextExercise = {
      name,
      sets,
      restTime,
      method: 'Normal',
      setDetails: [],
    };
    try {
      props.onUpdateSession({ workout: { ...workout, exercises: [...exercises, nextExercise] } });
      setAddExerciseOpen(false);
      setAddExerciseDraft({ name: '', sets: String(sets), restTime: String(restTime ?? DEFAULT_EXTRA_EXERCISE_REST_TIME_S) });
    } catch (e) {
      try {
        await alert('Não foi possível adicionar exercício extra: ' + (e?.message || String(e || '')));
      } catch {}
    }
  };

  const openOrganizeModal = () => {
    const draft = buildExerciseDraft(exercises);
    setOrganizeDraft(draft);
    organizeBaseKeysRef.current = draftOrderKeys(draft);
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
      }).catch(() => null);
      const result = response ? await response.json().catch(() => null) : null;
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
    } catch (e) {
      setOrganizeError(String(e?.message || e || 'Falha ao salvar a ordem.'));
    } finally {
      setOrganizeSaving(false);
    }
  };

  const finishWorkout = async () => {
    if (!session || !workout) return;
    if (finishing) return;

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
      const safeExercises = Array.isArray(workout?.exercises)
        ? workout.exercises.map((ex) => {
            if (!ex || typeof ex !== 'object') return null;
            return {
              name: String(ex?.name || '').trim(),
              sets: Number(ex?.sets) || (Array.isArray(ex?.setDetails) ? ex.setDetails.length : 0),
              reps: ex?.reps ?? '',
              rpe: ex?.rpe ?? null,
              cadence: ex?.cadence ?? null,
              restTime: ex?.restTime ?? ex?.rest_time ?? null,
              method: ex?.method ?? null,
              videoUrl: ex?.videoUrl ?? ex?.video_url ?? null,
              notes: ex?.notes ?? null,
              setDetails: Array.isArray(ex?.setDetails) ? ex.setDetails : Array.isArray(ex?.set_details) ? ex.set_details : [],
            };
          })
        : [];

      const payload = {
        workoutTitle: String(workout?.title || 'Treino'),
        date: new Date().toISOString(),
        totalTime: elapsedSeconds,
        realTotalTime: elapsedSeconds,
        logs: logs && typeof logs === 'object' ? logs : {},
        exercises: safeExercises.filter((x) => x && typeof x === 'object' && String(x.name || '').length > 0),
        originWorkoutId: workout?.id ?? null,
        preCheckin: ui?.preCheckin ?? null,
        postCheckin,
      };

      let savedId = null;
      if (shouldSaveHistory) {
        // Generate idempotency key to prevent duplicates on retry
        const idempotencyKey = `finish_${workout?.id || 'unknown'}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const submission = { session: payload, idempotencyKey };
        
        try {
          // Attempt online save first if network appears available
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
                    // Check if validation error (400-499) or server error (500+)
                    if (resp.status >= 400 && resp.status < 500) {
                        const errText = await resp.text();
                        throw new Error(`Erro de validação: ${errText}`);
                    }
                    // For 500+, we throw to trigger offline fallback
                    throw new Error(`Erro do servidor: ${resp.status}`);
                }
             } catch (fetchErr) {
                 // If it's a validation error, rethrow to stop process
                 if (String(fetchErr).includes('Erro de validação')) throw fetchErr;
                 // Otherwise (network fail, 500), fall through to offline queue
                 console.warn('Online save failed, attempting offline queue', fetchErr);
             }
          }

          if (!onlineSuccess) {
              // Fallback to offline queue
              await queueFinishWorkout(submission);
              await alert('Sem conexão estável. Treino salvo na fila e será sincronizado automaticamente.', 'Salvo Offline');
              savedId = 'offline-pending';
          }

        } catch (e) {
          const msg = e?.message ? String(e.message) : String(e);
          // If it was a validation error, we show it and abort finish
          if (msg.includes('Erro de validação')) {
              await alert(msg);
              setFinishing(false);
              return;
          }
          
          // If queue failed too
          await alert('CRÍTICO: Erro ao salvar treino: ' + (msg || 'erro inesperado'));
          // We do NOT set savedId, so report logic below might fail or be skipped?
          // Actually, if we fail to save, we probably shouldn't finish the workout state locally?
          // The user asked to ensure history is saved.
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
    } catch (e) {
      const msg = e?.message ? String(e.message) : String(e);
      await alert('Erro ao finalizar: ' + (msg || 'erro inesperado'));
    } finally {
      setFinishing(false);
    }
  };

  const renderNormalSet = (ex, exIdx, setIdx) => {
    const key = `${exIdx}-${setIdx}`;
    const log = getLog(key);
    const cfg = getPlanConfig(ex, setIdx);
    const plannedSet = getPlannedSet(ex, setIdx);
    const restTime = parseTrainingNumber(ex?.restTime ?? ex?.rest_time);
    const weightValue = String(log?.weight ?? cfg?.weight ?? '');
    const repsValue = String(log?.reps ?? '');
    const rpeValue = String(log?.rpe ?? '');
    const notesValue = String(log?.notes ?? '');
    const done = !!log?.done;
    const plannedReps = String(plannedSet?.reps ?? ex?.reps ?? '').trim();
    const plannedRpe = String(plannedSet?.rpe ?? ex?.rpe ?? '').trim();
    const suggestion = deloadSuggestions?.[key] && typeof deloadSuggestions[key] === 'object' ? deloadSuggestions[key] : null;
    const useWatermark = DELOAD_SUGGEST_MODE === 'watermark';
    const weightPlaceholder = useWatermark && suggestion?.weight != null ? `${suggestion.weight} kg` : 'Peso (kg)';
    const repsPlaceholder = useWatermark && suggestion?.reps != null ? String(suggestion.reps) : 'Reps';
    const rpePlaceholder = useWatermark && suggestion?.rpe != null ? String(suggestion.rpe) : 'RPE';

    const isHeaderRow = setIdx === 0;
    const notesId = `notes-${key}`;
    const hasNotes = notesValue.trim().length > 0;
    const isNotesOpen = openNotesKeys.has(key);

    const toggleNotes = () => {
      setOpenNotesKeys((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    };

    return (
      <div className="space-y-1" key={key}>
        {isHeaderRow && (
          <div className="hidden sm:flex items-center gap-2 text-[10px] uppercase tracking-widest text-neutral-500 font-bold px-1">
            <div className="w-10">Série</div>
            <div className="w-24">Peso (kg)</div>
            <div className="w-24">Reps</div>
            <div className="w-24">RPE</div>
            <div className="ml-auto flex items-center gap-2">Ações</div>
          </div>
        )}
        <div className="rounded-xl bg-neutral-900/50 border border-neutral-800/80 px-3 py-2.5 space-y-2 shadow-sm shadow-black/20">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-mono text-neutral-400">#{setIdx + 1}</div>
            <button
              type="button"
              onClick={toggleNotes}
              className={
                isNotesOpen || hasNotes
                  ? 'inline-flex items-center justify-center rounded-lg p-2 text-yellow-500 bg-yellow-500/10 border border-yellow-500/40 hover:bg-yellow-500/15 transition duration-200'
                  : 'inline-flex items-center justify-center rounded-lg p-2 text-neutral-400 bg-black/30 border border-neutral-700 hover:border-yellow-500/60 hover:text-yellow-500 transition duration-200'
              }
            >
              <MessageSquare size={14} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-[6rem_6rem_6rem_auto] sm:items-center">
            <input
              inputMode="decimal"
              value={weightValue}
              onChange={(e) => {
                const v = e?.target?.value ?? '';
                updateLog(key, { weight: v, advanced_config: cfg ?? log?.advanced_config ?? null });
              }}
              placeholder={weightPlaceholder}
              className="w-full bg-black/30 border border-neutral-700 rounded-xl px-3 py-1.5 text-sm text-white outline-none focus:ring-1 ring-yellow-500 transition duration-200 placeholder:text-neutral-600 placeholder:opacity-40 focus:placeholder:opacity-0"
            />
            <div className="relative">
              <input
                inputMode="decimal"
                value={repsValue}
                onChange={(e) => {
                  const v = e?.target?.value ?? '';
                  updateLog(key, { reps: v, advanced_config: cfg ?? log?.advanced_config ?? null });
                }}
                placeholder={repsPlaceholder}
                className="w-full bg-black/30 border border-neutral-700 rounded-xl px-3 py-1.5 pr-10 text-sm text-white outline-none focus:ring-1 ring-yellow-500 transition duration-200 placeholder:text-neutral-600 placeholder:opacity-40 focus:placeholder:opacity-0"
              />
              {plannedReps ? (
                <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-neutral-500/60">
                  {plannedReps}
                </div>
              ) : null}
            </div>
            <div className="relative">
              <input
                inputMode="decimal"
                value={rpeValue}
                onChange={(e) => {
                  const v = e?.target?.value ?? '';
                  updateLog(key, { rpe: v, advanced_config: cfg ?? log?.advanced_config ?? null });
                }}
                placeholder={rpePlaceholder}
                className="w-full bg-black/30 border border-yellow-500/30 rounded-xl px-3 py-1.5 pr-10 text-sm text-yellow-500 font-bold outline-none focus:ring-1 ring-yellow-500 transition duration-200 placeholder:text-yellow-500/50 focus:placeholder:opacity-0"
              />
              {plannedRpe ? (
                <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-yellow-500/45">
                  {plannedRpe}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => {
                const nextDone = !done;
                updateLog(key, { done: nextDone, advanced_config: cfg ?? log?.advanced_config ?? null });
                if (nextDone && restTime && restTime > 0) {
                  startTimer(restTime, { kind: 'rest', key });
                }
              }}
              className={
                done
                  ? 'inline-flex items-center justify-center gap-2 min-h-[40px] px-3 py-2 rounded-xl bg-yellow-500 text-black font-black shadow-yellow-500/20 shadow-sm active:scale-95 transition duration-150'
                  : 'inline-flex items-center justify-center gap-2 min-h-[40px] px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 font-bold hover:bg-neutral-700 active:scale-95 transition duration-150'
              }
            >
              <Check size={16} />
              <span className="text-xs">{done ? 'Feito' : 'Concluir'}</span>
            </button>
          </div>
        </div>
        {isNotesOpen && (
          <div className="px-1">
            <textarea
              id={notesId}
              value={notesValue}
              onChange={(e) => {
                const v = e?.target?.value ?? '';
                updateLog(key, { notes: v, advanced_config: cfg ?? log?.advanced_config ?? null });
              }}
              placeholder="Observações da série (opcional)"
              rows={2}
              className="w-full bg-black/30 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500 shadow-sm shadow-yellow-500/10 transition duration-200"
            />
          </div>
        )}
      </div>
    );
  };

  const renderRestPauseSet = (ex, exIdx, setIdx) => {
    const key = `${exIdx}-${setIdx}`;
    const log = getLog(key);
    const cfg = getPlanConfig(ex, setIdx);
    const plannedSet = getPlannedSet(ex, setIdx);
    const restTime = parseTrainingNumber(ex?.restTime ?? ex?.rest_time);
    const suggestion = deloadSuggestions?.[key] && typeof deloadSuggestions[key] === 'object' ? deloadSuggestions[key] : null;
    const useWatermark = DELOAD_SUGGEST_MODE === 'watermark';
    const weightPlaceholder = useWatermark && suggestion?.weight != null ? `${suggestion.weight} kg` : 'kg';
    const repsPlaceholder = useWatermark && suggestion?.reps != null ? String(suggestion.reps) : 'reps';

    const auto = plannedSet?.it_auto && typeof plannedSet.it_auto === 'object' ? plannedSet.it_auto : null;
    const modeLabel = String(auto?.label || '').trim() || (String(auto?.kind || '') === 'sst' ? 'SST' : 'Rest-P');

    const pauseSec = parseTrainingNumber(cfg?.rest_time_sec) ?? 15;
    const miniSets = Math.max(0, Math.floor(parseTrainingNumber(cfg?.mini_sets) ?? 0));

    const rp = isObject(log?.rest_pause) ? log.rest_pause : {};
    const activation = parseTrainingNumber(rp?.activation_reps) ?? null;
    const minisArrRaw = Array.isArray(rp?.mini_reps) ? rp.mini_reps : [];
    const minis = Array.from({ length: miniSets }).map((_, idx) => {
      const v = minisArrRaw?.[idx];
      const n = parseTrainingNumber(v);
      return n;
    });

    const total = (activation ?? 0) + minis.reduce((acc, v) => acc + (v ?? 0), 0);
    const done = !!log?.done;
    const canDone = (activation ?? 0) > 0 && (miniSets === 0 || minis.every((v) => Number.isFinite(v) && v > 0));

    const notesValue = String(log?.notes ?? '');

    return (
      <div key={key} className="space-y-2">
        <div className="rounded-xl bg-neutral-900/50 border border-neutral-800/80 px-3 py-2.5 space-y-2 shadow-sm shadow-black/20">
          <div className="flex items-center gap-2">
            <div className="w-10 text-xs font-mono text-neutral-400">#{setIdx + 1}</div>
            <input
              inputMode="decimal"
              value={String(log?.weight ?? cfg?.weight ?? '')}
              onChange={(e) => {
                const v = e?.target?.value ?? '';
                updateLog(key, { weight: v, advanced_config: cfg ?? log?.advanced_config ?? null });
              }}
              placeholder={weightPlaceholder}
              className="w-24 bg-black/30 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
            />
            <button
              type="button"
              onClick={() => {
                const baseWeight = String(log?.weight ?? cfg?.weight ?? '').trim();
                const baseRpe = String(log?.rpe ?? '').trim();
                const nextMiniCount = Math.max(0, Math.floor(miniSets));
                const minisInput = Array.from({ length: nextMiniCount }).map((_, idx) => {
                  const v = minisArrRaw?.[idx];
                  const n = parseTrainingNumber(v);
                  return n != null && n > 0 ? n : null;
                });
                setRestPauseModal({
                  key,
                  label: modeLabel,
                  pauseSec,
                  miniSets: nextMiniCount,
                  weight: baseWeight,
                  activationReps: activation != null && activation > 0 ? activation : null,
                  minis: minisInput,
                  rpe: baseRpe,
                  cfg: cfg ?? null,
                  error: '',
                });
              }}
              className="bg-black/30 border border-neutral-700 rounded-xl px-2 sm:px-3 py-2 text-sm text-white outline-none hover:border-yellow-500/60 hover:text-yellow-500 transition-colors inline-flex items-center justify-center gap-2"
            >
              <Pencil size={14} />
              <span className="text-xs font-black hidden sm:inline">Abrir</span>
            </button>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-[10px] uppercase tracking-widest font-black text-yellow-500">{modeLabel === 'SST' ? 'SST' : 'Rest-P'}</span>
              <span className="text-xs text-neutral-400 whitespace-normal">Intra {pauseSec || 0}s • Minis: {miniSets} • Total: {total || 0} reps</span>
            </div>
            <button
              type="button"
              disabled={!canDone}
              onClick={() => {
                const nextDone = !done;
                updateLog(key, {
                  done: nextDone,
                  reps: String(total || ''),
                  rest_pause: { ...rp, activation_reps: activation ?? null, mini_reps: minis },
                  advanced_config: cfg ?? log?.advanced_config ?? null,
                });
                if (nextDone && restTime && restTime > 0) startTimer(restTime, { kind: 'rest', key });
              }}
              className={
                canDone
                  ? done
                    ? 'inline-flex items-center justify-center gap-2 min-h-[40px] px-3 py-2 rounded-xl bg-yellow-500 text-black font-black shadow-yellow-500/20 shadow-sm active:scale-95 transition duration-150 sm:w-auto'
                    : 'inline-flex items-center justify-center gap-2 min-h-[40px] px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 font-bold hover:bg-neutral-700 active:scale-95 transition duration-150 sm:w-auto'
                  : 'inline-flex items-center justify-center gap-2 min-h-[40px] px-3 py-2 rounded-xl bg-neutral-800/40 border border-neutral-800 text-neutral-500 font-bold cursor-not-allowed sm:w-auto'
              }
            >
              <Check size={16} />
              <span className="text-xs">{done ? 'Feito' : 'Concluir'}</span>
            </button>
          </div>
        </div>
        <textarea
          value={notesValue}
          onChange={(e) => {
            const v = e?.target?.value ?? '';
            updateLog(key, { notes: v, advanced_config: cfg ?? log?.advanced_config ?? null });
          }}
          placeholder="Observações da série"
          rows={2}
          className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
        />
      </div>
    );
  };

  const renderClusterSet = (ex, exIdx, setIdx) => {
    const key = `${exIdx}-${setIdx}`;
    const log = getLog(key);
    const cfg = getPlanConfig(ex, setIdx);
    const restTime = parseTrainingNumber(ex?.restTime ?? ex?.rest_time);
    const suggestion = deloadSuggestions?.[key] && typeof deloadSuggestions[key] === 'object' ? deloadSuggestions[key] : null;
    const useWatermark = DELOAD_SUGGEST_MODE === 'watermark';
    const weightPlaceholder = useWatermark && suggestion?.weight != null ? `${suggestion.weight} kg` : 'kg';

    const totalRepsPlanned = parseTrainingNumber(cfg?.total_reps);
    const clusterSize = parseTrainingNumber(cfg?.cluster_size);
    const intra = parseTrainingNumber(cfg?.intra_rest_sec) ?? 15;
    const plannedBlocks = buildPlannedBlocks(totalRepsPlanned, clusterSize);

    const cluster = isObject(log?.cluster) ? log.cluster : {};
    const blocksRaw = Array.isArray(cluster?.blocks) ? cluster.blocks : [];
    const blocks = plannedBlocks.map((_, idx) => {
      const v = blocksRaw?.[idx];
      const n = parseTrainingNumber(v);
      return n;
    });

    const total = blocks.reduce((acc, v) => acc + (v ?? 0), 0);
    const done = !!log?.done;
    const canDone = plannedBlocks.length > 0 && blocks.every((v) => Number.isFinite(v) && v > 0);

    const lastRestAfterBlock = Number(cluster?.last_rest_after_block);
    const lastRest = Number.isFinite(lastRestAfterBlock) ? lastRestAfterBlock : -1;

    const updateCluster = (patch) => {
      const nextCluster = {
        planned: { total_reps: totalRepsPlanned ?? null, cluster_size: clusterSize ?? null, intra_rest_sec: intra ?? null },
        ...cluster,
        ...(patch && typeof patch === 'object' ? patch : {}),
      };
      updateLog(key, {
        cluster: nextCluster,
        reps: String(total || ''),
        done: !!log?.done,
        weight: String(log?.weight ?? cfg?.weight ?? ''),
        advanced_config: cfg ?? log?.advanced_config ?? null,
      });
    };

    const maybeStartIntraRest = (afterBlockIndex) => {
      try {
        const idx = Number(afterBlockIndex);
        if (!Number.isFinite(idx) || idx < 0) return;
        if (idx >= plannedBlocks.length - 1) return;
        if (idx <= lastRest) return;
        if (!intra || intra <= 0) return;
        startTimer(intra, { kind: 'cluster', key, blockIndex: idx });
        updateCluster({ last_rest_after_block: idx });
      } catch {}
    };

    const notation = plannedBlocks.length ? plannedBlocks.join('+') : '';
    const notesValue = String(log?.notes ?? '');

    return (
      <div key={key} className="space-y-2">
        <div className="rounded-xl bg-neutral-900/50 border border-neutral-800/80 px-3 py-2.5 space-y-2 shadow-sm shadow-black/20">
          <div className="flex items-center gap-2">
            <div className="w-10 text-xs font-mono text-neutral-400">#{setIdx + 1}</div>
            <input
              inputMode="decimal"
              value={String(log?.weight ?? cfg?.weight ?? '')}
              onChange={(e) => {
                const v = e?.target?.value ?? '';
                updateLog(key, { weight: v, advanced_config: cfg ?? log?.advanced_config ?? null });
              }}
              placeholder={weightPlaceholder}
              className="w-24 bg-black/30 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
            />
            <button
              type="button"
              onClick={() => {
                const baseWeight = String(log?.weight ?? cfg?.weight ?? '').trim();
                const baseRpe = String(log?.rpe ?? '').trim();
                const planned = {
                  total_reps: totalRepsPlanned ?? null,
                  cluster_size: clusterSize ?? null,
                  intra_rest_sec: intra ?? null,
                };
                const plannedBlocksModal = buildPlannedBlocks(totalRepsPlanned, clusterSize);
                const restsByGap = plannedBlocksModal.length > 1 ? Array.from({ length: plannedBlocksModal.length - 1 }).map(() => intra) : [];
                const blocksInput = plannedBlocksModal.map((plannedBlock, idx) => ({ planned: plannedBlock, weight: baseWeight, reps: blocks?.[idx] ?? null }));
                setClusterModal({
                  key,
                  planned,
                  plannedBlocks: plannedBlocksModal,
                  intra,
                  restsByGap,
                  blocks: blocksInput,
                  baseWeight,
                  rpe: baseRpe,
                  cfg: cfg ?? log?.advanced_config ?? null,
                  error: '',
                });
              }}
              className="bg-black/30 border border-neutral-700 rounded-xl px-2 sm:px-3 py-2 text-sm text-white outline-none hover:border-yellow-500/60 hover:text-yellow-500 transition-colors inline-flex items-center justify-center gap-2"
            >
              <Pencil size={14} />
              <span className="text-xs font-black hidden sm:inline">Abrir</span>
            </button>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-[10px] uppercase tracking-widest font-black text-yellow-500">Cluster</span>
              <span className="text-xs text-neutral-400 whitespace-normal">
                {notation ? `(${notation})` : ''} • Intra {intra || 0}s • Total: {total || 0} reps
              </span>
            </div>
            <button
              type="button"
              disabled={!canDone}
              onClick={() => {
                const nextDone = !done;
                updateLog(key, {
                  done: nextDone,
                  reps: String(total || ''),
                  cluster: {
                    planned: { total_reps: totalRepsPlanned ?? null, cluster_size: clusterSize ?? null, intra_rest_sec: intra ?? null },
                    blocks,
                    last_rest_after_block: Number.isFinite(lastRestAfterBlock) ? lastRestAfterBlock : null,
                  },
                  advanced_config: cfg ?? log?.advanced_config ?? null,
                });
                if (nextDone && restTime && restTime > 0) startTimer(restTime, { kind: 'rest', key });
              }}
              className={
                canDone
                  ? done
                    ? 'inline-flex items-center justify-center gap-2 min-h-[40px] px-3 py-2 rounded-xl bg-yellow-500 text-black font-black shadow-yellow-500/20 shadow-sm active:scale-95 transition duration-150 sm:w-auto'
                    : 'inline-flex items-center justify-center gap-2 min-h-[40px] px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 font-bold hover:bg-neutral-700 active:scale-95 transition duration-150 sm:w-auto'
                  : 'inline-flex items-center justify-center gap-2 min-h-[40px] px-3 py-2 rounded-xl bg-neutral-800/40 border border-neutral-800 text-neutral-500 font-bold cursor-not-allowed sm:w-auto'
              }
            >
              <Check size={16} />
              <span className="text-xs">{done ? 'Feito' : 'Concluir'}</span>
            </button>
          </div>
        </div>

        {plannedBlocks.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {plannedBlocks.map((planned, idx) => {
              const current = blocks?.[idx] ?? null;
              return (
                <div key={`${key}-block-${idx}`} className="bg-neutral-900/40 border border-neutral-800 rounded-xl p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[10px] uppercase tracking-widest font-bold text-neutral-400">Bloco {idx + 1}</div>
                    <div className="text-[10px] font-mono text-neutral-500">plan {planned}</div>
                  </div>
                  <input
                    inputMode="decimal"
                    value={current == null ? '' : String(current)}
                    ref={(el) => {
                      if (!clusterRefs.current[key]) clusterRefs.current[key] = {};
                      clusterRefs.current[key][idx] = el;
                    }}
                    onChange={(e) => {
                      const v = parseTrainingNumber(e?.target?.value);
                      const next = v != null && v > 0 ? v : null;
                      const nextBlocks = [...blocks];
                      nextBlocks[idx] = next;
                      updateCluster({ blocks: nextBlocks });
                    }}
                    onBlur={() => {
                      const cur = blocks?.[idx] ?? null;
                      const next = blocks?.[idx + 1] ?? null;
                      if (idx < plannedBlocks.length - 1 && (cur ?? 0) > 0 && (next ?? 0) <= 0) {
                        maybeStartIntraRest(idx);
                      }
                    }}
                    placeholder={useWatermark && suggestion?.reps != null && plannedBlocks.length <= 1 ? String(suggestion.reps) : 'reps'}
                    className="mt-2 w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                  />
                </div>
              );
            })}
          </div>
        )}
        <textarea
          value={notesValue}
          onChange={(e) => {
            const v = e?.target?.value ?? '';
            updateLog(key, { notes: v, advanced_config: cfg ?? log?.advanced_config ?? null });
          }}
          placeholder="Observações da série"
          rows={2}
          className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
        />
      </div>
    );
  };

  const renderDropSetSet = (ex, exIdx, setIdx) => {
    const key = `${exIdx}-${setIdx}`;
    const log = getLog(key);
    const plannedSet = getPlannedSet(ex, setIdx);
    const cfgRaw = plannedSet?.advanced_config ?? plannedSet?.advancedConfig ?? null;
    const stagesPlannedRaw = Array.isArray(cfgRaw) ? cfgRaw : [];
    const ds = isObject(log?.drop_set) ? log.drop_set : {};
    const stagesSavedRaw = Array.isArray(ds?.stages) ? ds.stages : [];
    const stagesCount = Math.max(stagesPlannedRaw.length, stagesSavedRaw.length);
    if (!stagesCount) return renderNormalSet(ex, exIdx, setIdx);

    const auto = plannedSet?.it_auto && typeof plannedSet.it_auto === 'object' ? plannedSet.it_auto : null;
    const modeLabel = String(auto?.label || '').trim() || 'Drop';

    const stages = Array.from({ length: stagesCount }).map((_, idx) => {
      const saved = stagesSavedRaw?.[idx] && typeof stagesSavedRaw[idx] === 'object' ? stagesSavedRaw[idx] : null;
      const planned = stagesPlannedRaw?.[idx] && typeof stagesPlannedRaw[idx] === 'object' ? stagesPlannedRaw[idx] : null;
      const weight = String(saved?.weight ?? planned?.weight ?? '').trim();
      const reps = parseTrainingNumber(saved?.reps ?? planned?.reps) ?? null;
      return { weight, reps };
    });

    const total = stages.reduce((acc, s) => acc + (parseTrainingNumber(s?.reps) ?? 0), 0);
    const done = !!log?.done;
    const canDone = stages.every((s) => String(s?.weight || '').trim() && (parseTrainingNumber(s?.reps) ?? 0) > 0);

    const notesValue = String(log?.notes ?? '');
    const hasNotes = notesValue.trim().length > 0;
    const isNotesOpen = openNotesKeys.has(key);

    const toggleNotes = () => {
      setOpenNotesKeys((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    };

    return (
      <div key={key} className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="w-10 text-xs font-mono text-neutral-400">#{setIdx + 1}</div>
          <button
            type="button"
            onClick={() => {
              const baseStages = stages.map((s) => ({
                weight: String(s?.weight ?? '').trim(),
                reps: parseTrainingNumber(s?.reps) ?? null,
              }));
              setDropSetModal({ key, label: modeLabel, stages: baseStages, error: '' });
            }}
            className="w-24 bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none hover:border-yellow-500/60 hover:text-yellow-500 transition-colors inline-flex items-center justify-center gap-2"
          >
            <Pencil size={14} />
            <span className="text-xs font-black">Abrir</span>
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-[10px] uppercase tracking-widest font-black text-yellow-500">{modeLabel || 'Drop'}</span>
            <span className="text-xs text-neutral-400 truncate">Etapas {stagesCount} • Total: {total || 0} reps</span>
          </div>
          <button
            type="button"
            onClick={toggleNotes}
            className={
              isNotesOpen || hasNotes
                ? 'inline-flex items-center justify-center rounded-lg p-2 text-yellow-500 bg-yellow-500/10 border border-yellow-500/40 hover:bg-yellow-500/15 transition duration-200'
                : 'inline-flex items-center justify-center rounded-lg p-2 text-neutral-400 bg-black/30 border border-neutral-700 hover:border-yellow-500/60 hover:text-yellow-500 transition duration-200'
            }
          >
            <MessageSquare size={14} />
          </button>
          <button
            type="button"
            disabled={!canDone}
            onClick={() => {
              const nextDone = !done;
              const lastWeight = String(stages?.[stages.length - 1]?.weight || '').trim();
              const stageOut = stages.map((s) => ({
                weight: String(s?.weight ?? '').trim(),
                reps: parseTrainingNumber(s?.reps) ?? null,
              }));
              updateLog(key, {
                done: nextDone,
                weight: lastWeight,
                reps: String(total || ''),
                drop_set: { stages: stageOut },
              });
            }}
            className={
              canDone
                ? done
                  ? 'inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-yellow-500 text-black font-black'
                  : 'inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 font-bold hover:bg-neutral-700'
                : 'inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-800/40 border border-neutral-800 text-neutral-500 font-bold cursor-not-allowed'
            }
          >
            <Check size={16} />
            <span className="text-xs">{done ? 'Feito' : 'Concluir'}</span>
          </button>
        </div>

        {!canDone && (
          <div className="pl-12 text-[11px] text-neutral-500 font-semibold">
            Preencha peso e reps em todas as etapas no modal para concluir.
          </div>
        )}

        {isNotesOpen && (
          <textarea
            value={notesValue}
            onChange={(e) => {
              const v = e?.target?.value ?? '';
              updateLog(key, { notes: v });
            }}
            placeholder="Observações da série"
            rows={2}
            className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
          />
        )}
      </div>
    );
  };

  const renderSet = (ex, exIdx, setIdx) => {
    const plannedSet = getPlannedSet(ex, setIdx);
    const rawCfg = plannedSet?.advanced_config ?? plannedSet?.advancedConfig ?? null;
    const key = `${exIdx}-${setIdx}`;
    const log = getLog(key);
    const hasDropStages = isObject(log?.drop_set) && Array.isArray(log?.drop_set?.stages) && log.drop_set.stages.length > 0;
    if (Array.isArray(rawCfg) || hasDropStages) return renderDropSetSet(ex, exIdx, setIdx);
    const cfg = getPlanConfig(ex, setIdx);
    const method = String(ex?.method || '').trim();
    const isCluster = method === 'Cluster' || isClusterConfig(cfg);
    const isRestPause = method === 'Rest-Pause' || isRestPauseConfig(cfg);
    if (isCluster) return renderClusterSet(ex, exIdx, setIdx);
    if (isRestPause) return renderRestPauseSet(ex, exIdx, setIdx);
    return renderNormalSet(ex, exIdx, setIdx);
  };

  const renderExercise = (ex, exIdx) => {
    const name = String(ex?.name || '').trim() || `Exercício ${exIdx + 1}`;
    const observation = String(ex?.notes || '').trim();
    const setsHeader = Math.max(0, Number.parseInt(String(ex?.sets ?? '0'), 10) || 0);
    const sdArr = Array.isArray(ex?.setDetails) ? ex.setDetails : Array.isArray(ex?.set_details) ? ex.set_details : [];
    const setsCount = Math.max(setsHeader, Array.isArray(sdArr) ? sdArr.length : 0);
    const collapsedNow = collapsed.has(exIdx);
    const restTime = parseTrainingNumber(ex?.restTime ?? ex?.rest_time);
    const videoUrl = String(ex?.videoUrl ?? ex?.video_url ?? '').trim();
    const isReportLoading = reportHistoryStatus?.status === 'loading' && reportHistoryLoadingRef.current;

    return (
      <div key={`ex-${exIdx}`} className="rounded-2xl bg-neutral-900/70 border border-neutral-800/80 p-4 shadow-[0_10px_28px_rgba(0,0,0,0.35)]">
        <div
          role="button"
          tabIndex={0}
          onClick={() => {
            setCurrentExerciseIdx(exIdx);
            toggleCollapse(exIdx);
          }}
          onKeyDown={(e) => {
            const key = e?.key;
            if (key === 'Enter' || key === ' ') {
              try {
                e.preventDefault();
              } catch {}
              setCurrentExerciseIdx(exIdx);
              toggleCollapse(exIdx);
            }
          }}
          className="w-full flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3"
        >
          <div className="min-w-0 text-left flex-1">
            <div className="flex items-center gap-2">
              <Dumbbell size={16} className="text-yellow-500" />
              <h3 className="font-black text-white truncate">{name}</h3>
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs text-neutral-400">
              <span className="font-mono">{setsCount} sets</span>
              <span className="opacity-30">•</span>
              <span className="font-mono">{restTime ? `${restTime}s` : '-'}</span>
              <span className="opacity-30">•</span>
              <span className="truncate">{String(ex?.method || 'Normal')}</span>
            </div>
            {observation ? (
              <div className="mt-2 rounded-xl bg-neutral-900/50 border border-yellow-500/20 px-3 py-2">
                <div className="text-sm text-neutral-200 whitespace-pre-wrap leading-snug">{observation}</div>
              </div>
            ) : null}
          </div>
          <div className="mt-1 grid grid-cols-4 gap-2 text-neutral-400 sm:flex sm:items-center sm:justify-end">
            {videoUrl ? (
              <button
                type="button"
                onClick={async (e) => {
                  try {
                    e.preventDefault();
                    e.stopPropagation();
                  } catch {}
                  setCurrentExerciseIdx(exIdx);
                  try {
                    const win = typeof window !== 'undefined' ? window : null;
                    if (!win || !videoUrl) throw new Error('URL do vídeo indisponível');
                    const opened = win.open(videoUrl, '_blank', 'noopener,noreferrer');
                    if (!opened) throw new Error('Popup bloqueado ao abrir vídeo');
                    console.debug('[ActiveWorkout] video opened', { exIdx, videoUrl });
                  } catch (err) {
                    console.error('[ActiveWorkout] video open failed', { exIdx, videoUrl, err });
                    try {
                      await alert('Não foi possível abrir o vídeo agora. Verifique o link e tente novamente.');
                    } catch {}
                  }
                }}
                className="h-9 w-9 inline-flex flex-col items-center justify-center rounded-xl bg-neutral-900 border border-neutral-800 text-yellow-500 hover:bg-neutral-800 transition-colors active:scale-95"
                title="Ver vídeo"
                aria-label="Ver vídeo"
              >
                <Play size={16} />
                <span className="mt-0.5 text-[10px] leading-none text-neutral-400 opacity-60">Vídeo</span>
              </button>
            ) : null}
            <ExecutionVideoCapture
              exerciseName={name}
              workoutId={workout?.id || null}
              exerciseId={ex?.id || ex?.exercise_id || null}
              exerciseLibraryId={ex?.exercise_library_id || null}
            />
            <button
              type="button"
              onClick={async (e) => {
                try {
                  e.preventDefault();
                  e.stopPropagation();
                } catch {}
                setCurrentExerciseIdx(exIdx);
                await openDeloadModal(ex, exIdx);
              }}
              className="h-9 w-9 inline-flex flex-col items-center justify-center rounded-xl bg-neutral-900 border border-neutral-800 text-yellow-500 hover:bg-neutral-800 transition-colors active:scale-95"
            >
              {isReportLoading ? <Loader2 size={14} className="animate-spin" /> : <ArrowDown size={14} />}
              <span className="mt-0.5 text-[10px] leading-none text-neutral-400 opacity-60">{isReportLoading ? 'Carregando' : 'Deload'}</span>
            </button>
            <div className="h-9 w-9 inline-flex items-center justify-center rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-400">
              {collapsedNow ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
            </div>
          </div>
        </div>

        {!collapsedNow && (
          <div className="mt-4 space-y-2">
            {Array.from({ length: setsCount }).map((_, setIdx) => renderSet(ex, exIdx, setIdx))}
            <button
              type="button"
              onClick={() => addExtraSetToExercise(exIdx)}
              className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-neutral-900 border border-neutral-800 text-yellow-500 font-black hover:bg-neutral-800 active:scale-95 transition-transform"
            >
              <Plus size={16} />
              <span className="text-sm">Série extra</span>
            </button>
          </div>
        )}
      </div>
    );
  };

  const ExerciseSortRow = ({ item, index, total, onMoveUp, onMoveDown }) => {
    const dragControls = useDragControls();
    const exercise = item?.exercise && typeof item.exercise === 'object' ? item.exercise : {};
    const name = String(exercise?.name || '').trim() || `Exercício ${Number(index) + 1}`;
    const canMoveUp = index > 0;
    const canMoveDown = index < total - 1;

    return (
      <Reorder.Item
        value={item}
        dragListener={false}
        dragControls={dragControls}
        className="rounded-xl bg-neutral-800 border border-neutral-700 p-3 flex items-center gap-3"
      >
        <button
          type="button"
          onPointerDown={(e) => dragControls.start(e)}
          className="h-10 w-10 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-300 inline-flex items-center justify-center active:scale-95"
        >
          <GripVertical size={16} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-black text-white truncate">{name}</div>
          <div className="text-[11px] text-neutral-500">Posição {index + 1}</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={!canMoveUp}
            className={
              canMoveUp
                ? 'h-10 w-10 rounded-xl bg-neutral-900 border border-neutral-700 text-yellow-500 inline-flex items-center justify-center hover:bg-neutral-800 active:scale-95'
                : 'h-10 w-10 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-700 inline-flex items-center justify-center'
            }
          >
            <ArrowUp size={16} />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={!canMoveDown}
            className={
              canMoveDown
                ? 'h-10 w-10 rounded-xl bg-neutral-900 border border-neutral-700 text-yellow-500 inline-flex items-center justify-center hover:bg-neutral-800 active:scale-95'
                : 'h-10 w-10 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-700 inline-flex items-center justify-center'
            }
          >
            <ArrowDown size={16} />
          </button>
        </div>
      </Reorder.Item>
    );
  };

  if (!session || !workout) {
    return (
      <div className="min-h-screen bg-neutral-900 text-white p-6">
        <div className="max-w-lg mx-auto rounded-xl bg-neutral-800 border border-neutral-700 p-6">
          <div className="text-sm text-neutral-300">Sessão inválida.</div>
          <div className="mt-4">
            <BackButton onClick={props?.onBack} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-900 text-white flex flex-col">
      <div className="sticky top-0 z-40 bg-neutral-950 border-b border-neutral-800 px-4 md:px-6 py-4 pt-safe">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BackButton onClick={props?.onBack} />
            <button
              type="button"
              onClick={() => setAddExerciseOpen(true)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-yellow-500 text-black hover:bg-yellow-400 transition-colors active:scale-95"
              title="Adicionar exercício extra"
            >
              <Plus size={16} />
              <span className="text-sm font-black hidden sm:inline">Exercício</span>
            </button>
            <button
              type="button"
              onClick={openOrganizeModal}
              disabled={exercises.length < 2}
              className={
                exercises.length < 2
                  ? 'inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-700'
                  : 'inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-800 text-yellow-500 hover:text-yellow-400 hover:bg-neutral-800 transition-colors active:scale-95'
              }
              title="Organizar exercícios"
            >
              <GripVertical size={16} />
              <span className="text-sm font-black hidden sm:inline">Organizar</span>
            </button>
            <button
              type="button"
              onClick={() => setInviteOpen(true)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-800 text-yellow-500 hover:text-yellow-400 hover:bg-neutral-800 transition-colors active:scale-95"
              title="Convidar para treinar junto"
            >
              <UserPlus size={16} />
              <span className="text-sm font-black hidden sm:inline">Convidar</span>
            </button>
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-black text-white truncate text-right">{String(workout?.title || 'Treino')}</div>
            <div className="text-xs text-neutral-400 flex items-center justify-end gap-2 mt-1">
              <Clock size={14} className="text-yellow-500" />
              <span className="font-mono text-yellow-500">{formatElapsed(elapsedSeconds)}</span>
            </div>
          </div>
        </div>
      </div>

      <InviteManager
        isOpen={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onInvite={async (targetUser) => {
          try {
            const payloadWorkout = workout && typeof workout === 'object'
              ? { ...workout, exercises: Array.isArray(workout?.exercises) ? workout.exercises : [] }
              : { title: 'Treino', exercises: [] };
            await sendInvite(targetUser, payloadWorkout);
          } catch (e) {
            const msg = e?.message || String(e || '');
            await alert('Falha ao enviar convite: ' + msg);
          }
        }}
      />

      {clusterModal && (
        <div
          className="fixed inset-0 z-[1400] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 pt-safe"
          onClick={() => setClusterModal(null)}
        >
          <div
            className="w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-neutral-800 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-black uppercase tracking-widest text-yellow-500">Cluster</div>
                <div className="text-white font-black text-lg truncate">Preencher blocos</div>
                <div className="text-xs text-neutral-400 truncate">
                  {Array.isArray(clusterModal?.plannedBlocks) ? `${clusterModal.plannedBlocks.length} blocos` : 'Blocos'}
                  {Array.isArray(clusterModal?.restsByGap) && clusterModal.restsByGap.length
                    ? ` • descanso ${clusterModal.restsByGap[0]}s`
                    : clusterModal?.intra
                      ? ` • descanso ${clusterModal.intra}s`
                      : ''}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setClusterModal(null)}
                className="w-10 h-10 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 hover:bg-neutral-700 inline-flex items-center justify-center"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto custom-scrollbar">
              {clusterModal?.error ? (
                <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-3 text-sm text-neutral-200">
                  {String(clusterModal.error)}
                </div>
              ) : null}
              {Array.isArray(clusterModal?.blocks) && clusterModal.blocks.length > 0 ? (
                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setClusterModal((prev) => {
                        if (!prev || typeof prev !== 'object') return prev;
                        const plannedBlocks = Array.isArray(prev?.plannedBlocks) ? prev.plannedBlocks : [];
                        const restsByGap = Array.isArray(prev?.restsByGap) ? prev.restsByGap : [];
                        const baseWeight = String(prev?.baseWeight ?? '').trim();
                        const blocks = plannedBlocks.map((p) => ({ planned: p, weight: baseWeight, reps: null }));
                        return { ...prev, restsByGap, blocks, error: '' };
                      });
                    }}
                    className="min-h-[40px] px-4 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black text-xs uppercase tracking-widest hover:bg-neutral-800"
                  >
                    Resetar pesos
                  </button>
                </div>
              ) : null}

              {!Array.isArray(clusterModal?.blocks) || clusterModal.blocks.length === 0 ? (
                <div className="rounded-xl border border-neutral-800 bg-neutral-950/30 p-3">
                  <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Configurar Cluster</div>
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input
                      inputMode="decimal"
                      value={String(clusterModal?.planned?.total_reps ?? '')}
                      onChange={(e) => {
                        const v = parseTrainingNumber(e?.target?.value);
                        setClusterModal((prev) => {
                          if (!prev || typeof prev !== 'object') return prev;
                          const planned = prev.planned && typeof prev.planned === 'object' ? prev.planned : {};
                          return { ...prev, planned: { ...planned, total_reps: v ?? null }, error: '' };
                        });
                      }}
                      placeholder="Total reps (ex.: 12)"
                      className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                    />
                    <input
                      inputMode="decimal"
                      value={String(clusterModal?.planned?.cluster_blocks_count ?? '')}
                      onChange={(e) => {
                        const v = parseTrainingNumber(e?.target?.value);
                        setClusterModal((prev) => {
                          if (!prev || typeof prev !== 'object') return prev;
                          const planned = prev.planned && typeof prev.planned === 'object' ? prev.planned : {};
                          return { ...prev, planned: { ...planned, cluster_blocks_count: v ?? null }, error: '' };
                        });
                      }}
                      placeholder="Blocos (ex.: 3)"
                      className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                    />
                    <input
                      inputMode="decimal"
                      value={String(clusterModal?.planned?.intra_rest_sec ?? clusterModal?.intra ?? '')}
                      onChange={(e) => {
                        const v = parseTrainingNumber(e?.target?.value);
                        setClusterModal((prev) => {
                          if (!prev || typeof prev !== 'object') return prev;
                          const planned = prev.planned && typeof prev.planned === 'object' ? prev.planned : {};
                          return { ...prev, planned: { ...planned, intra_rest_sec: v ?? null }, intra: v ?? prev.intra ?? 15, error: '' };
                        });
                      }}
                      placeholder="Descanso (s) (ex.: 15)"
                      className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        const total = parseTrainingNumber(clusterModal?.planned?.total_reps);
                        const blocksCount = parseTrainingNumber(clusterModal?.planned?.cluster_blocks_count);
                        const intra = parseTrainingNumber(clusterModal?.planned?.intra_rest_sec) ?? parseTrainingNumber(clusterModal?.intra) ?? 15;
                        const plannedBlocks = buildBlocksByCount(total, blocksCount);
                        if (!plannedBlocks.length) {
                          setClusterModal((prev) =>
                            prev && typeof prev === 'object'
                              ? { ...prev, error: 'Configuração inválida. Preencha total reps e quantidade de blocos.' }
                              : prev,
                          );
                          return;
                        }
                        const restsByGap = plannedBlocks.length > 1 ? Array.from({ length: plannedBlocks.length - 1 }).map(() => intra) : [];
                        const baseWeight = String(clusterModal?.baseWeight ?? '').trim();
                        const blocks = plannedBlocks.map((p) => ({ planned: p, weight: baseWeight, reps: null }));
                        setClusterModal((prev) => {
                          if (!prev || typeof prev !== 'object') return prev;
                          const planned = prev.planned && typeof prev.planned === 'object' ? prev.planned : {};
                          return {
                            ...prev,
                            planned: { ...planned, total_reps: total ?? null, cluster_blocks_count: blocksCount ?? null, intra_rest_sec: intra ?? null },
                            plannedBlocks,
                            restsByGap,
                            blocks,
                            error: '',
                          };
                        });
                      }}
                      className="min-h-[40px] px-4 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black text-xs uppercase tracking-widest hover:bg-neutral-800"
                    >
                      Gerar blocos
                    </button>
                  </div>
                </div>
              ) : null}
              {Array.isArray(clusterModal?.blocks) &&
                clusterModal.blocks.map((b, idx) => {
                  const planned = b?.planned ?? null;
                  const repsValue = b?.reps == null ? '' : String(b.reps);
                  const weightValue = String(b?.weight ?? '');
                  const isLast = idx >= clusterModal.blocks.length - 1;
                  const restSec = Array.isArray(clusterModal?.restsByGap) ? Number(clusterModal.restsByGap?.[idx]) : Number(clusterModal?.intra);
                  const safeRestSec = Number.isFinite(restSec) && restSec > 0 ? restSec : 0;
                  return (
                    <div key={`cluster-block-${idx}`} className="rounded-xl border border-neutral-800 bg-neutral-950/30 p-3 relative">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[10px] uppercase tracking-widest font-bold text-neutral-400">Bloco {idx + 1}</div>
                        {planned ? <div className="text-[10px] font-mono text-neutral-500">plan {planned}</div> : <div />}
                      </div>
                      {!isLast && safeRestSec ? (
                        <button
                          type="button"
                          onClick={() => {
                            startTimer(safeRestSec, { kind: 'cluster', key: clusterModal?.key, blockIndex: idx });
                          }}
                          className="absolute top-3 right-3 inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 hover:bg-neutral-800 active:scale-95 transition-transform z-10"
                          aria-label={`Iniciar descanso ${safeRestSec}s`}
                        >
                          <Clock size={14} className="text-yellow-500" />
                          <span className="text-xs font-black">{safeRestSec}s</span>
                        </button>
                      ) : null}
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <input
                          inputMode="decimal"
                          value={weightValue}
                          onChange={(e) => {
                            const v = e?.target?.value ?? '';
                            setClusterModal((prev) => {
                              if (!prev || typeof prev !== 'object') return prev;
                              const nextBlocks = Array.isArray(prev.blocks) ? [...prev.blocks] : [];
                              const cur = nextBlocks[idx] && typeof nextBlocks[idx] === 'object' ? nextBlocks[idx] : {};
                              nextBlocks[idx] = { ...cur, weight: v };
                              return { ...prev, blocks: nextBlocks, error: '' };
                            });
                          }}
                          placeholder="kg"
                          className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                        />
                        <input
                          inputMode="decimal"
                          value={repsValue}
                          onChange={(e) => {
                            const v = parseTrainingNumber(e?.target?.value);
                            const next = v != null && v > 0 ? v : null;
                            setClusterModal((prev) => {
                              if (!prev || typeof prev !== 'object') return prev;
                              const nextBlocks = Array.isArray(prev.blocks) ? [...prev.blocks] : [];
                              const cur = nextBlocks[idx] && typeof nextBlocks[idx] === 'object' ? nextBlocks[idx] : {};
                              nextBlocks[idx] = { ...cur, reps: next };
                              return { ...prev, blocks: nextBlocks, error: '' };
                            });
                          }}
                          placeholder="reps"
                          className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                        />
                      </div>
                      {!isLast ? <div className="mt-2 text-xs text-neutral-500">Descanso: {safeRestSec}s</div> : null}
                    </div>
                  );
                })}

              <div className="rounded-xl border border-neutral-800 bg-neutral-950/30 p-3">
                <div className="text-xs font-black uppercase tracking-widest text-neutral-400">RPE da série</div>
                <input
                  inputMode="decimal"
                  value={String(clusterModal?.rpe ?? '')}
                  onChange={(e) => {
                    const v = e?.target?.value ?? '';
                    setClusterModal((prev) => (prev && typeof prev === 'object' ? { ...prev, rpe: v, error: '' } : prev));
                  }}
                  placeholder="RPE (0-10)"
                  className="mt-2 w-full bg-black/30 border border-yellow-500/30 rounded-lg px-3 py-2 text-sm text-yellow-500 font-bold outline-none focus:ring-1 ring-yellow-500"
                />
              </div>
            </div>

            <div className="p-4 border-t border-neutral-800 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setClusterModal(null)}
                className="min-h-[44px] px-4 py-3 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-200 font-black text-xs uppercase tracking-widest hover:bg-neutral-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={saveClusterModal}
                disabled={!Array.isArray(clusterModal?.blocks) || clusterModal.blocks.length === 0}
                className={
                  !Array.isArray(clusterModal?.blocks) || clusterModal.blocks.length === 0
                    ? 'min-h-[44px] px-4 py-3 rounded-xl bg-yellow-500/40 text-black/60 font-black text-xs uppercase tracking-widest inline-flex items-center gap-2 cursor-not-allowed'
                    : 'min-h-[44px] px-4 py-3 rounded-xl bg-yellow-500 text-black font-black text-xs uppercase tracking-widest hover:bg-yellow-400 inline-flex items-center gap-2'
                }
              >
                <Save size={16} />
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {restPauseModal && (
        <div
          className="fixed inset-0 z-[1400] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 pt-safe"
          onClick={() => setRestPauseModal(null)}
        >
          <div
            className="w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-neutral-800 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-black uppercase tracking-widest text-yellow-500">{String(restPauseModal?.label || '').trim() === 'SST' ? 'SST' : 'Rest-P'}</div>
                <div className="text-white font-black text-lg truncate">Preencher minis</div>
                <div className="text-xs text-neutral-400 truncate">
                  {Number(restPauseModal?.miniSets || 0)} minis • descanso {Number(restPauseModal?.pauseSec || 0)}s
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRestPauseModal(null)}
                className="w-10 h-10 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 hover:bg-neutral-700 inline-flex items-center justify-center"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto custom-scrollbar">
              {restPauseModal?.error ? (
                <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-3 text-sm text-neutral-200">
                  {String(restPauseModal.error)}
                </div>
              ) : null}

              <div className="rounded-xl border border-neutral-800 bg-neutral-950/30 p-3">
                <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Configurar {String(restPauseModal?.label || 'Rest-P')}</div>
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    inputMode="decimal"
                    value={String(restPauseModal?.miniSets ?? '')}
                    onChange={(e) => {
                      const v = parseTrainingNumber(e?.target?.value);
                      setRestPauseModal((prev) => (prev && typeof prev === 'object' ? { ...prev, miniSets: v ?? 0, error: '' } : prev));
                    }}
                    placeholder="Minis (ex.: 2)"
                    className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                  />
                  <input
                    inputMode="decimal"
                    value={String(restPauseModal?.pauseSec ?? '')}
                    onChange={(e) => {
                      const v = parseTrainingNumber(e?.target?.value);
                      setRestPauseModal((prev) => (prev && typeof prev === 'object' ? { ...prev, pauseSec: v ?? 15, error: '' } : prev));
                    }}
                    placeholder="Descanso (s) (ex.: 15)"
                    className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                  />
                  <input
                    inputMode="decimal"
                    value={String(restPauseModal?.weight ?? '')}
                    onChange={(e) => {
                      const v = e?.target?.value ?? '';
                      setRestPauseModal((prev) => (prev && typeof prev === 'object' ? { ...prev, weight: v, error: '' } : prev));
                    }}
                    placeholder="kg"
                    className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                  />
                </div>
                <div className="mt-2 flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      const minisCount = Math.max(0, Math.floor(parseTrainingNumber(restPauseModal?.miniSets) ?? 0));
                      if (!minisCount) {
                        setRestPauseModal((prev) =>
                          prev && typeof prev === 'object' ? { ...prev, error: 'Defina a quantidade de minis.' } : prev,
                        );
                        return;
                      }
                      setRestPauseModal((prev) => {
                        if (!prev || typeof prev !== 'object') return prev;
                        return { ...prev, miniSets: minisCount, minis: Array.from({ length: minisCount }).map(() => null), error: '' };
                      });
                    }}
                    className="min-h-[40px] px-4 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black text-xs uppercase tracking-widest hover:bg-neutral-800"
                  >
                    Gerar minis
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-neutral-800 bg-neutral-950/30 p-3 relative">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[10px] uppercase tracking-widest font-bold text-neutral-400">Ativação</div>
                  <div className="text-[10px] font-mono text-neutral-500">{Number(restPauseModal?.activationReps || 0)} reps</div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <input
                    inputMode="decimal"
                    value={String(restPauseModal?.weight ?? '')}
                    onChange={(e) => {
                      const v = e?.target?.value ?? '';
                      setRestPauseModal((prev) => (prev && typeof prev === 'object' ? { ...prev, weight: v, error: '' } : prev));
                    }}
                    placeholder="kg"
                    className="w-full bg-black/30 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                  />
                  <input
                    inputMode="decimal"
                    value={String(restPauseModal?.activationReps ?? '')}
                    onChange={(e) => {
                      const v = parseTrainingNumber(e?.target?.value);
                      setRestPauseModal((prev) => (prev && typeof prev === 'object' ? { ...prev, activationReps: v ?? null, error: '' } : prev));
                    }}
                    placeholder="Reps ativação"
                    className="w-full bg-black/30 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                  />
                </div>
              </div>

              {Array.isArray(restPauseModal?.minis) &&
                restPauseModal.minis.map((mini, idx) => {
                  const isLast = idx >= restPauseModal.minis.length - 1;
                  const restSec = Number(restPauseModal?.pauseSec || 0);
                  const safeRestSec = Number.isFinite(restSec) && restSec > 0 ? restSec : 0;
                  return (
                    <div key={`mini-${idx}`} className="rounded-xl border border-neutral-800 bg-neutral-950/30 p-3 relative">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[10px] uppercase tracking-widest font-bold text-neutral-400">Mini {idx + 1}</div>
                        {!isLast ? <div className="text-[10px] font-mono text-neutral-500">Descanso {safeRestSec}s</div> : <div />}
                      </div>
                      {!isLast && safeRestSec ? (
                        <button
                          type="button"
                          onClick={() => {
                            startTimer(safeRestSec, { kind: 'rest_pause', key: restPauseModal?.key, miniIndex: idx });
                          }}
                          className="absolute top-3 right-3 inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 hover:bg-neutral-800 active:scale-95 transition-transform z-10"
                          aria-label={`Iniciar descanso ${safeRestSec}s`}
                        >
                          <Clock size={14} className="text-yellow-500" />
                          <span className="text-xs font-black">{safeRestSec}s</span>
                        </button>
                      ) : null}
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <input
                          inputMode="decimal"
                          value={String(restPauseModal?.weight ?? '')}
                          onChange={(e) => {
                            const v = e?.target?.value ?? '';
                            setRestPauseModal((prev) => (prev && typeof prev === 'object' ? { ...prev, weight: v, error: '' } : prev));
                          }}
                          placeholder="kg"
                          className="w-full bg-black/30 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                        />
                        <input
                          inputMode="decimal"
                          value={mini == null ? '' : String(mini)}
                          onChange={(e) => {
                            const n = parseTrainingNumber(e?.target?.value);
                            const next = n != null && n > 0 ? n : null;
                            setRestPauseModal((prev) => {
                              if (!prev || typeof prev !== 'object') return prev;
                              const list = Array.isArray(prev.minis) ? [...prev.minis] : [];
                              list[idx] = next;
                              return { ...prev, minis: list, error: '' };
                            });
                          }}
                          placeholder="reps"
                          className="w-full bg-black/30 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                        />
                      </div>
                      {!isLast && safeRestSec ? <div className="mt-2 text-xs text-neutral-500">Descanso: {safeRestSec}s</div> : null}
                    </div>
                  );
                })}

              <div className="rounded-xl border border-neutral-800 bg-neutral-950/30 p-3">
                <div className="text-xs font-black uppercase tracking-widest text-neutral-400">RPE da série</div>
                <input
                  inputMode="decimal"
                  value={String(restPauseModal?.rpe ?? '')}
                  onChange={(e) => {
                    const v = e?.target?.value ?? '';
                    setRestPauseModal((prev) => (prev && typeof prev === 'object' ? { ...prev, rpe: v, error: '' } : prev));
                  }}
                  placeholder="RPE (0-10)"
                  className="mt-2 w-full bg-black/30 border border-yellow-500/30 rounded-xl px-3 py-2 text-sm text-yellow-500 font-bold outline-none focus:ring-1 ring-yellow-500"
                />
              </div>
            </div>

            <div className="p-4 border-t border-neutral-800 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setRestPauseModal(null)}
                className="min-h-[44px] px-4 py-3 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-200 font-black text-xs uppercase tracking-widest hover:bg-neutral-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={saveRestPauseModal}
                className="min-h-[44px] px-4 py-3 rounded-xl bg-yellow-500 text-black font-black text-xs uppercase tracking-widest hover:bg-yellow-400 inline-flex items-center gap-2"
              >
                <Save size={16} />
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {dropSetModal && (
        <div
          className="fixed inset-0 z-[1400] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 pt-safe"
          onClick={() => setDropSetModal(null)}
        >
          {(() => {
            const modalKey = String(dropSetModal?.key || '').trim();
            const suggestion = modalKey && deloadSuggestions?.[modalKey] && typeof deloadSuggestions[modalKey] === 'object' ? deloadSuggestions[modalKey] : null;
            const useWatermark = DELOAD_SUGGEST_MODE === 'watermark';
            const weightPlaceholder = useWatermark && suggestion?.weight != null ? `${suggestion.weight} kg` : 'kg';
            const repsPlaceholder = useWatermark && suggestion?.reps != null ? String(suggestion.reps) : 'reps';
            return (
          <div
            className="w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-neutral-800 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-black uppercase tracking-widest text-yellow-500">{String(dropSetModal?.label || 'Drop')}</div>
                <div className="text-white font-black text-lg truncate">Preencher etapas</div>
                <div className="text-xs text-neutral-400 truncate">{Array.isArray(dropSetModal?.stages) ? dropSetModal.stages.length : 0} etapas</div>
              </div>
              <button
                type="button"
                onClick={() => setDropSetModal(null)}
                className="w-10 h-10 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 hover:bg-neutral-700 inline-flex items-center justify-center"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto custom-scrollbar">
              {dropSetModal?.error ? (
                <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-3 text-sm text-neutral-200">
                  {String(dropSetModal.error)}
                </div>
              ) : null}

              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Etapas</div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const pickWeight = () => {
                        const stages = Array.isArray(dropSetModal?.stages) ? dropSetModal.stages : [];
                        for (const st of stages) {
                          const w = String(st?.weight ?? '').trim();
                          if (w) return w;
                        }
                        return '';
                      };
                      const w = pickWeight();
                      if (!w) {
                        try {
                          window.alert('Preencha pelo menos 1 etapa com peso antes de linkar.');
                        } catch {}
                        return;
                      }
                      setDropSetModal((prev) => {
                        if (!prev || typeof prev !== 'object') return prev;
                        const stages = Array.isArray(prev.stages) ? prev.stages : [];
                        const nextStages = stages.map((st) => {
                          const cur = st && typeof st === 'object' ? st : {};
                          return { ...cur, weight: w };
                        });
                        return { ...prev, stages: nextStages, error: '' };
                      });
                    }}
                    className="min-h-[36px] px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black text-xs uppercase tracking-widest hover:bg-neutral-800 inline-flex items-center gap-2"
                  >
                    <Link2 size={14} />
                    Linkar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDropSetModal((prev) => {
                        if (!prev || typeof prev !== 'object') return prev;
                        const list = Array.isArray(prev.stages) ? [...prev.stages] : [];
                        if (list.length >= DROPSET_STAGE_LIMIT) return prev;
                        list.push({ weight: '', reps: null });
                        return { ...prev, stages: list, error: '' };
                      });
                    }}
                    className="min-h-[36px] px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black text-xs uppercase tracking-widest hover:bg-neutral-800 inline-flex items-center gap-2"
                  >
                    <Plus size={14} />
                    Adicionar
                  </button>
                </div>
              </div>

              {Array.isArray(dropSetModal?.stages) &&
                dropSetModal.stages.map((st, idx) => (
                  <div key={`ds-${idx}`} className="rounded-xl border border-neutral-800 bg-neutral-950/30 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[10px] uppercase tracking-widest font-bold text-neutral-400">Etapa {idx + 1}</div>
                      <button
                        type="button"
                        onClick={() => {
                          setDropSetModal((prev) => {
                            if (!prev || typeof prev !== 'object') return prev;
                            const list = Array.isArray(prev.stages) ? [...prev.stages] : [];
                            list.splice(idx, 1);
                            return { ...prev, stages: list, error: '' };
                          });
                        }}
                        className="h-9 w-9 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 hover:bg-neutral-800 inline-flex items-center justify-center"
                        aria-label="Remover etapa"
                      >
                        <X size={14} />
                      </button>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <input
                        inputMode="decimal"
                        value={String(st?.weight ?? '')}
                        onChange={(e) => {
                          const v = e?.target?.value ?? '';
                          setDropSetModal((prev) => {
                            if (!prev || typeof prev !== 'object') return prev;
                            const list = Array.isArray(prev.stages) ? [...prev.stages] : [];
                            const cur = list[idx] && typeof list[idx] === 'object' ? list[idx] : {};
                            list[idx] = { ...cur, weight: v };
                            return { ...prev, stages: list, error: '' };
                          });
                        }}
                        placeholder={weightPlaceholder}
                        className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                      />
                      <input
                        inputMode="decimal"
                        value={st?.reps == null ? '' : String(st.reps)}
                        onChange={(e) => {
                          const n = parseTrainingNumber(e?.target?.value);
                          const next = n != null && n > 0 ? n : null;
                          setDropSetModal((prev) => {
                            if (!prev || typeof prev !== 'object') return prev;
                            const list = Array.isArray(prev.stages) ? [...prev.stages] : [];
                            const cur = list[idx] && typeof list[idx] === 'object' ? list[idx] : {};
                            list[idx] = { ...cur, reps: next };
                            return { ...prev, stages: list, error: '' };
                          });
                        }}
                        placeholder={repsPlaceholder}
                        className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                      />
                    </div>
                  </div>
                ))}
            </div>

            <div className="p-4 border-t border-neutral-800 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setDropSetModal(null)}
                className="min-h-[44px] px-4 py-3 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-200 font-black text-xs uppercase tracking-widest hover:bg-neutral-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={saveDropSetModal}
                className="min-h-[44px] px-4 py-3 rounded-xl bg-yellow-500 text-black font-black text-xs uppercase tracking-widest hover:bg-yellow-400 inline-flex items-center gap-2"
              >
                <Save size={16} />
                Salvar
              </button>
            </div>
          </div>
            );
          })()}
        </div>
      )}

      {postCheckinOpen && (
        <div
          className="fixed inset-0 z-[1200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 pt-safe"
          onClick={() => {
            setPostCheckinOpen(false);
            const r = postCheckinResolveRef.current;
            postCheckinResolveRef.current = null;
            if (typeof r === 'function') r(null);
          }}
        >
          <div className="bg-neutral-900 w-full max-w-md rounded-2xl border border-neutral-800 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-neutral-800 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-black uppercase tracking-widest text-yellow-500">Check-in</div>
                <div className="text-white font-black text-lg truncate">Pós-treino</div>
                <div className="text-xs text-neutral-400 truncate">{String(workout?.title || 'Treino')}</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPostCheckinOpen(false);
                  const r = postCheckinResolveRef.current;
                  postCheckinResolveRef.current = null;
                  if (typeof r === 'function') r(null);
                }}
                className="w-10 h-10 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 hover:bg-neutral-700 inline-flex items-center justify-center"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="space-y-2">
                <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Esforço (RPE 1–10)</div>
                <select
                  value={String(postCheckinDraft?.rpe ?? '')}
                  onChange={(e) => setPostCheckinDraft((prev) => ({ ...prev, rpe: String(e.target.value || '') }))}
                  className="w-full min-h-[44px] bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white"
                >
                  <option value="">Não informar</option>
                  {Array.from({ length: 10 }).map((_, i) => (
                    <option key={i + 1} value={String(i + 1)}>
                      {i + 1}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Satisfação (1–5)</div>
                <div className="grid grid-cols-5 gap-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setPostCheckinDraft((prev) => ({ ...prev, satisfaction: String(n) }))}
                      className={
                        String(postCheckinDraft?.satisfaction || '') === String(n)
                          ? 'min-h-[44px] rounded-xl bg-yellow-500 text-black font-black'
                          : 'min-h-[44px] rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black hover:bg-neutral-800'
                      }
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Dor / Soreness (0–10)</div>
                <select
                  value={String(postCheckinDraft?.soreness ?? '')}
                  onChange={(e) => setPostCheckinDraft((prev) => ({ ...prev, soreness: String(e.target.value || '') }))}
                  className="w-full min-h-[44px] bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white"
                >
                  <option value="">Não informar</option>
                  {Array.from({ length: 11 }).map((_, i) => (
                    <option key={i} value={String(i)}>
                      {i}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Observações (opcional)</div>
                <textarea
                  value={String(postCheckinDraft?.notes || '')}
                  onChange={(e) => setPostCheckinDraft((prev) => ({ ...prev, notes: String(e.target.value || '') }))}
                  className="w-full min-h-[90px] bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white outline-none"
                  placeholder="Ex.: treino pesado, boa técnica, ajustar carga na próxima…"
                />
              </div>
            </div>
            <div className="p-4 border-t border-neutral-800 flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setPostCheckinOpen(false);
                  const r = postCheckinResolveRef.current;
                  postCheckinResolveRef.current = null;
                  if (typeof r === 'function') r(null);
                }}
                className="flex-1 min-h-[44px] px-4 py-3 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 font-bold hover:bg-neutral-700"
              >
                Pular
              </button>
              <button
                type="button"
                onClick={() => {
                  setPostCheckinOpen(false);
                  const r = postCheckinResolveRef.current;
                  postCheckinResolveRef.current = null;
                  if (typeof r === 'function') r(postCheckinDraft);
                }}
                className="flex-1 min-h-[44px] px-4 py-3 rounded-xl bg-yellow-500 text-black font-black hover:bg-yellow-400"
              >
                Continuar
              </button>
            </div>
          </div>
        </div>
      )}

      {deloadModal && (
        <div
          className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 pt-safe"
          onClick={() => setDeloadModal(null)}
        >
          {(() => {
            const baseWeight = Number(deloadModal?.baseWeight || 0);
            const suggestedWeight = Number(deloadModal?.suggestedWeight || 0);
            const reductionPct = Math.round((Number(deloadModal?.reductionPct || 0) * 1000) / 10) / 10;
            const minWeight = Number(deloadModal?.minWeight || 0);
            const canApply = Number.isFinite(baseWeight) && baseWeight > 0 && Number.isFinite(suggestedWeight) && suggestedWeight > 0;
            const reportStatus = String(reportHistoryStatus?.status || 'idle');
            const reportSource = String(reportHistoryStatus?.source || '');
            const reportUpdatedLabel = reportHistoryUpdatedAt
              ? new Date(reportHistoryUpdatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
              : '';
            const reportLabel =
              reportStatus === 'loading'
                ? 'Carregando relatórios…'
                : reportStatus === 'error'
                  ? 'Relatórios indisponíveis. Usando dados locais.'
                  : reportSource === 'cache'
                    ? 'Relatórios carregados do cache.'
                    : reportSource === 'cache-stale'
                      ? 'Relatórios do cache (atualizando).'
                      : reportSource === 'network'
                        ? 'Relatórios atualizados.'
                        : 'Relatórios prontos.';
            return (
              <div
                className="w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-4 border-b border-neutral-800 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[11px] uppercase tracking-widest text-yellow-500 font-black">Deload</div>
                    <div className="text-lg font-black text-white truncate">{String(deloadModal?.name || 'Exercício')}</div>
                    <div className="text-xs text-neutral-400 truncate">{String(deloadModal?.reason || '')}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDeloadModal(null)}
                    className="h-10 w-10 inline-flex items-center justify-center rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 hover:bg-neutral-700"
                    aria-label="Fechar"
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="p-4 space-y-4">
                  <div className="rounded-xl bg-neutral-950/40 border border-neutral-800 p-3 text-xs text-neutral-400 flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate">{reportLabel}</span>
                    {reportUpdatedLabel ? <span className="font-mono text-yellow-500">{reportUpdatedLabel}</span> : null}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-neutral-950/40 border border-neutral-800 p-3">
                      <div className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold">Peso base</div>
                      <div className="mt-2 text-xl font-black text-white">{baseWeight ? `${baseWeight} kg` : '-'}</div>
                    </div>
                    <div className="rounded-xl bg-neutral-950/40 border border-yellow-500/30 p-3">
                      <div className="text-[10px] uppercase tracking-widest text-yellow-500 font-black">Peso sugerido</div>
                      <div className="mt-2 text-xl font-black text-yellow-500">{suggestedWeight ? `${suggestedWeight} kg` : '-'}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold">Redução (%)</label>
                      <input
                        inputMode="decimal"
                        value={Number.isFinite(reductionPct) ? String(reductionPct) : ''}
                        onChange={(e) => updateDeloadModalFromPercent(e?.target?.value ?? '')}
                        className="mt-2 w-full bg-black/30 border border-neutral-700 rounded-xl px-3 py-3 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                        placeholder="12"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold">Peso sugerido (kg)</label>
                      <input
                        inputMode="decimal"
                        value={Number.isFinite(suggestedWeight) ? String(suggestedWeight) : ''}
                        onChange={(e) => updateDeloadModalFromWeight(e?.target?.value ?? '')}
                        className="mt-2 w-full bg-black/30 border border-neutral-700 rounded-xl px-3 py-3 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                        placeholder="100"
                      />
                    </div>
                  </div>
                  <div className="rounded-xl bg-neutral-950/40 border border-neutral-800 p-3 text-xs text-neutral-400">
                    <div className="flex items-center justify-between gap-2">
                      <span>Histórico analisado</span>
                      <span className="font-mono text-yellow-500">{Number(deloadModal?.historyCount || 0)} treinos</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <span>Peso mínimo seguro</span>
                      <span className="font-mono text-yellow-500">{minWeight ? `${Math.round(minWeight * 10) / 10} kg` : '-'}</span>
                    </div>
                  </div>
                </div>
                <div className="p-4 border-t border-neutral-800 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setDeloadModal(null)}
                    className="flex-1 min-h-[44px] rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 font-bold hover:bg-neutral-700"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={applyDeloadToExercise}
                    disabled={!canApply}
                    className={
                      canApply
                        ? 'flex-1 min-h-[44px] rounded-xl bg-yellow-500 text-black font-black hover:bg-yellow-400 inline-flex items-center justify-center gap-2'
                        : 'flex-1 min-h-[44px] rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-500 font-black'
                    }
                  >
                    <Check size={16} />
                    Aplicar agora
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {addExerciseOpen && (
        <div className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setAddExerciseOpen(false)}>
          <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-neutral-800 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-widest text-neutral-500 font-bold">Treino ativo</div>
                <div className="text-lg font-black text-white truncate">Adicionar exercício extra</div>
              </div>
              <button
                type="button"
                onClick={() => setAddExerciseOpen(false)}
                className="h-10 w-10 inline-flex items-center justify-center rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 hover:bg-neutral-700"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold">Nome do exercício</label>
                <input
                  value={String(addExerciseDraft?.name ?? '')}
                  onChange={(e) => setAddExerciseDraft((prev) => ({ ...(prev || {}), name: e?.target?.value ?? '' }))}
                  className="mt-2 w-full bg-black/30 border border-neutral-700 rounded-xl px-3 py-3 text-sm text-white outline-none focus:ring-1 ring-yellow-500 placeholder:text-neutral-600 placeholder:opacity-40"
                  placeholder="Ex: Supino reto"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold">Sets</label>
                  <input
                    inputMode="decimal"
                    value={String(addExerciseDraft?.sets ?? '')}
                    onChange={(e) => setAddExerciseDraft((prev) => ({ ...(prev || {}), sets: e?.target?.value ?? '' }))}
                    className="mt-2 w-full bg-black/30 border border-neutral-700 rounded-xl px-3 py-3 text-sm text-white outline-none focus:ring-1 ring-yellow-500 placeholder:text-neutral-600 placeholder:opacity-40"
                    placeholder="3"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold">Descanso (s)</label>
                  <input
                    inputMode="decimal"
                    value={String(addExerciseDraft?.restTime ?? '')}
                    onChange={(e) => setAddExerciseDraft((prev) => ({ ...(prev || {}), restTime: e?.target?.value ?? '' }))}
                    className="mt-2 w-full bg-black/30 border border-neutral-700 rounded-xl px-3 py-3 text-sm text-white outline-none focus:ring-1 ring-yellow-500 placeholder:text-neutral-600 placeholder:opacity-40"
                    placeholder="60"
                  />
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-neutral-800 flex gap-2">
              <button
                type="button"
                onClick={() => setAddExerciseOpen(false)}
                className="flex-1 min-h-[44px] rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 font-bold hover:bg-neutral-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={addExtraExerciseToWorkout}
                className="flex-1 min-h-[44px] rounded-xl bg-yellow-500 text-black font-black hover:bg-yellow-400"
              >
                Adicionar
              </button>
            </div>
          </div>
        </div>
      )}

      {organizeOpen && (
        <div className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={requestCloseOrganize}>
          <div className="w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-neutral-800 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-widest text-neutral-500 font-bold">Treino ativo</div>
                <div className="text-lg font-black text-white truncate">Organizar exercícios</div>
                <div className="text-xs text-neutral-500">Arraste ou use as setas para reordenar.</div>
              </div>
              <button
                type="button"
                onClick={requestCloseOrganize}
                className="h-10 w-10 inline-flex items-center justify-center rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 hover:bg-neutral-700"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-4 space-y-3">
              {organizeDraft.length === 0 ? (
                <div className="rounded-xl bg-neutral-800 border border-neutral-700 p-4 text-sm text-neutral-400">Sem exercícios para organizar.</div>
              ) : (
                <Reorder.Group axis="y" values={organizeDraft} onReorder={setOrganizeDraft} className="space-y-2">
                  {organizeDraft.map((item, index) => (
                    <ExerciseSortRow
                      key={String(item?.key ?? `item-${index}`)}
                      item={item}
                      index={index}
                      total={organizeDraft.length}
                      onMoveUp={() => setOrganizeDraft((prev) => moveDraftItem(prev, index, index - 1))}
                      onMoveDown={() => setOrganizeDraft((prev) => moveDraftItem(prev, index, index + 1))}
                    />
                  ))}
                </Reorder.Group>
              )}
              {organizeError ? <div className="text-sm text-red-400">{organizeError}</div> : null}
            </div>
            <div className="p-4 border-t border-neutral-800 flex gap-2">
              <button
                type="button"
                onClick={requestCloseOrganize}
                className="flex-1 min-h-[44px] rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 font-bold hover:bg-neutral-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={saveOrganize}
                disabled={organizeSaving || !organizeDirty}
                className={
                  organizeSaving
                    ? 'flex-1 min-h-[44px] rounded-xl bg-yellow-500/70 text-black font-black inline-flex items-center justify-center gap-2 cursor-wait'
                    : !organizeDirty
                      ? 'flex-1 min-h-[44px] rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-500 font-bold'
                      : 'flex-1 min-h-[44px] rounded-xl bg-yellow-500 text-black font-black hover:bg-yellow-400 inline-flex items-center justify-center gap-2'
                }
              >
                {organizeSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                <span>Salvar ordem</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 w-full max-w-6xl mx-auto px-4 md:px-6 py-4 pb-28 space-y-4">
        {exercises.length === 0 ? (
          <div className="rounded-xl bg-neutral-800 border border-neutral-700 p-6 text-neutral-300">Sem exercícios neste treino.</div>
        ) : (
          exercises.map((ex, exIdx) => renderExercise(ex, exIdx))
        )}
      </div>

      <div className="fixed right-4 bottom-24 sm:bottom-6 z-[60]">
        {timerMinimized ? (
          <button
            type="button"
            onClick={() => setTimerMinimized(false)}
            className="inline-flex items-center gap-2 rounded-2xl bg-neutral-900/95 border border-neutral-700 px-3 py-2 text-neutral-200 shadow-xl hover:bg-neutral-800"
          >
            <Clock size={16} className="text-yellow-500" />
            <span className="text-xs font-black">Tempo</span>
            <span className="text-sm font-mono text-yellow-500">{formatElapsed(elapsedSeconds)}</span>
            <ChevronUp size={16} className="text-neutral-400" />
          </button>
        ) : (
          <div className="w-[240px] rounded-2xl bg-neutral-900/95 border border-neutral-700 p-3 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold">Timer</div>
                <div className="text-sm font-black text-white truncate">{currentExercise?.name || 'Treino ativo'}</div>
                <div className="text-[11px] text-neutral-500">Descanso: {currentExercise?.rest ? `${currentExercise.rest}s` : '-'}</div>
              </div>
              <button
                type="button"
                onClick={() => setTimerMinimized(true)}
                className="h-8 w-8 inline-flex items-center justify-center rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 hover:bg-neutral-700"
                aria-label="Minimizar timer"
              >
                <ChevronDown size={16} />
              </button>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <div className="text-2xl font-black text-white font-mono">{formatElapsed(elapsedSeconds)}</div>
              <div className="text-[10px] uppercase tracking-widest text-yellow-500 font-black">Sessão</div>
            </div>
          </div>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-50 bg-neutral-950/95 backdrop-blur border-t border-neutral-800 px-4 md:px-6 py-3 pb-safe">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={async () => {
              const ok = await confirm('Cancelar treino em andamento? (não salva no histórico)', 'Cancelar');
              if (!ok) return;
              try {
                if (typeof props?.onFinish === 'function') props.onFinish(null, false);
              } catch {}
            }}
            className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 font-bold hover:bg-neutral-700"
          >
            <X size={16} />
            <span className="text-sm">Cancelar</span>
          </button>

          <button
            type="button"
            disabled={finishing}
            onClick={finishWorkout}
            className={
              finishing
                ? 'inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-yellow-500/70 text-black font-black cursor-wait'
                : 'inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-yellow-500 text-black font-black hover:bg-yellow-400'
            }
          >
            <Save size={16} />
            <span className="text-sm">Finalizar</span>
          </button>
        </div>
      </div>
    </div>
  );
}
