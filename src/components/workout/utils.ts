
import { UnknownRecord, ReportHistory, ReportHistoryItem } from './types';

export const DELOAD_HISTORY_KEY = 'irontracks.deload.history.v1';
export const DELOAD_AUDIT_KEY = 'irontracks.deload.audit.v1';
export const DELOAD_HISTORY_SIZE = 6;
export const DELOAD_HISTORY_MIN = 4;
export const DELOAD_RECENT_WINDOW = 3;
export const DELOAD_STAGNATION_PCT = 0.02;
export const DELOAD_REGRESSION_PCT = 0.03;
export const DELOAD_REDUCTION_STABLE = 0.12;
export const DELOAD_REDUCTION_STAGNATION = 0.15;
export const DELOAD_REDUCTION_OVERTRAIN = 0.22;
export const DELOAD_MIN_1RM_FACTOR = 0.5;
export const DELOAD_REDUCTION_MIN = 0.05;
export const DELOAD_REDUCTION_MAX = 0.4;
export const WEIGHT_ROUND_STEP = 0.5;
export const REPORT_HISTORY_LIMIT = 80;
export const REPORT_CACHE_KEY = 'irontracks.report.history.v1';
export const REPORT_CACHE_TTL_MS = 1000 * 60 * 15;
export const REPORT_FETCH_TIMEOUT_MS = 9000;
export const DELOAD_SUGGEST_MODE = 'watermark';
export const DEFAULT_SUGGESTED_RPE = 8;
export const AI_SUGGESTION_MIN_HISTORY = 2;
export const AI_SUGGESTION_TIMEOUT_MS = 8000;
export const DROPSET_STAGE_LIMIT = 20;

export const isObject = (v: unknown): v is UnknownRecord => v !== null && typeof v === 'object' && !Array.isArray(v);

export const isClusterConfig = (cfg: unknown) => {
  if (!isObject(cfg)) return false;
  const hasClusterSize = cfg.cluster_size != null;
  const hasIntra = cfg.intra_rest_sec != null;
  const hasTotal = cfg.total_reps != null;
  return (hasClusterSize && hasIntra) || (hasClusterSize && hasTotal) || (hasIntra && hasTotal);
};

export const isRestPauseConfig = (cfg: unknown) => {
  if (!isObject(cfg)) return false;
  const hasMiniSets = cfg.mini_sets != null;
  const hasRest = cfg.rest_time_sec != null;
  const hasInitial = cfg.initial_reps != null;
  return (hasMiniSets && hasRest) || (hasMiniSets && hasInitial) || (hasRest && hasInitial);
};

export const buildPlannedBlocks = (totalReps: unknown, clusterSize: unknown) => {
  const t = Number(totalReps);
  const c = Number(clusterSize);
  if (!Number.isFinite(t) || t <= 0) return [];
  if (!Number.isFinite(c) || c <= 0) return [];
  const blocks: unknown[] = [];
  let remaining = t;
  while (remaining > 0) {
    const next = Math.min(c, remaining);
    blocks.push(next);
    remaining -= next;
    if (blocks.length > 50) break;
  }
  return blocks;
};

export const buildBlocksByCount = (totalReps: unknown, blocksCount: unknown) => {
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

export const toNumber = (v: unknown): number | null => {
  const raw = String(v ?? '').replace(',', '.');
  const match = raw.match(/-?\d+(?:\.\d+)?/);
  const n = Number(match ? match[0] : '');
  return Number.isFinite(n) ? n : null;
};

export const safeJsonParse = (raw: unknown): unknown => {
  try {
    if (!raw) return null;
    if (typeof raw === 'object') return raw;
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
};

export const toDateMs = (value: unknown): number | null => {
  try {
    const dateInput = typeof value === 'string' || typeof value === 'number' || value instanceof Date ? value : 0;
    const t = new Date(dateInput).getTime();
    return Number.isFinite(t) ? t : null;
  } catch {
    return null;
  }
};

export const averageNumbers = (list: unknown): number | null => {
  const arr = Array.isArray(list) ? list.filter((v) => Number.isFinite(Number(v))) : [];
  if (!arr.length) return null;
  const total = arr.reduce((acc, v) => acc + Number(v || 0), 0);
  return total / arr.length;
};

export const extractLogWeight = (log: unknown): number | null => {
  const base: UnknownRecord = isObject(log) ? log : {};
  const direct = toNumber(base.weight ?? null);
  if (direct != null && direct > 0) return direct;
  const dropSet = isObject(base.drop_set) ? (base.drop_set as UnknownRecord) : null;
  const dropStages = dropSet && Array.isArray(dropSet.stages) ? (dropSet.stages as unknown[]) : [];
  const dropWeight = averageNumbers(
    dropStages
      .map((s) => (isObject(s) ? toNumber((s as UnknownRecord).weight) : null))
      .filter((v) => typeof v === 'number' && Number.isFinite(v) && v > 0),
  );
  if (dropWeight != null && dropWeight > 0) return dropWeight;
  const cluster = isObject(base.cluster) ? (base.cluster as UnknownRecord) : null;
  const clusterBlocks = cluster && Array.isArray(cluster.blocksDetailed) ? (cluster.blocksDetailed as unknown[]) : [];
  const clusterWeight = averageNumbers(
    clusterBlocks
      .map((b) => (isObject(b) ? toNumber((b as UnknownRecord).weight) : null))
      .filter((v) => typeof v === 'number' && Number.isFinite(v) && v > 0),
  );
  if (clusterWeight != null && clusterWeight > 0) return clusterWeight;
  const restPause = isObject(base.rest_pause) ? (base.rest_pause as UnknownRecord) : null;
  const restPauseWeight = toNumber(restPause ? restPause.weight : null);
  if (restPauseWeight != null && restPauseWeight > 0) return restPauseWeight;
  return null;
};

export const withTimeout = async <T,>(promise: PromiseLike<T>, ms: number): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<T>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('timeout')), ms);
    });
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timeoutId);
  }
};

export const normalizeReportHistory = (data: unknown): ReportHistory => {
  const base: UnknownRecord = isObject(data) ? data : {};
  const exercisesRaw = isObject(base.exercises) ? (base.exercises as UnknownRecord) : ({} as UnknownRecord);
  const exercises: ReportHistory['exercises'] = {};
  Object.entries(exercisesRaw).forEach(([key, value]) => {
    if (!isObject(value)) return;
    const name = String(value.name || '').trim();
    if (!name) return;
    const itemsRaw = Array.isArray(value.items) ? (value.items as unknown[]) : [];
    const items: ReportHistoryItem[] = itemsRaw
      .map((it) => {
        if (!isObject(it)) return null;
        const ts = Number(it.ts);
        if (!Number.isFinite(ts) || ts <= 0) return null;
        const avgWeight = typeof it.avgWeight === 'number' ? it.avgWeight : null;
        const avgReps = typeof it.avgReps === 'number' ? it.avgReps : null;
        const totalVolume = Number(it.totalVolume);
        const topWeight = typeof it.topWeight === 'number' ? it.topWeight : null;
        const setsCount = Number(it.setsCount);
        const maybeName = typeof it.name === 'string' ? it.name : null;
        return {
          ts,
          avgWeight,
          avgReps,
          totalVolume: Number.isFinite(totalVolume) ? totalVolume : 0,
          topWeight,
          setsCount: Number.isFinite(setsCount) ? setsCount : 0,
          ...(maybeName ? { name: maybeName } : {}),
        };
      })
      .filter((v): v is ReportHistoryItem => v !== null);
    exercises[key] = { name, items };
  });
  const version = Number(base.version) || 1;
  return { version, exercises };
};

export const readReportCache = (): { data: ReportHistory; cachedAt: number; stale: boolean } | null => {
  try {
    const win = typeof window !== 'undefined' ? window : null;
    if (!win || !win.localStorage) return null;
    const raw = win.localStorage.getItem(REPORT_CACHE_KEY);
    if (!raw) return null;
    const parsed = safeJsonParse(raw);
    if (!isObject(parsed)) return null;
    const cachedAt = Number(parsed.cachedAt ?? 0);
    const data = normalizeReportHistory(parsed.data ?? null);
    if (!cachedAt || !data) return null;
    const age = Date.now() - cachedAt;
    return { data, cachedAt, stale: Number.isFinite(age) ? age > REPORT_CACHE_TTL_MS : true };
  } catch {
    return null;
  }
};

export const writeReportCache = (data: unknown) => {
  try {
    const win = typeof window !== 'undefined' ? window : null;
    if (!win || !win.localStorage) return;
    const payload = { cachedAt: Date.now(), data: normalizeReportHistory(data) };
    win.localStorage.setItem(REPORT_CACHE_KEY, JSON.stringify(payload));
  } catch {}
};

export const clampNumber = (value: unknown, min: number, max: number) => {
  const v = Number(value);
  if (!Number.isFinite(v)) return min;
  return Math.min(max, Math.max(min, v));
};

export const roundToStep = (value: unknown, step: unknown) => {
  const v = Number(value);
  const s = Number(step);
  if (!Number.isFinite(v) || !Number.isFinite(s) || s <= 0) return v;
  return Math.round(v / s) * s;
};

export const normalizeExerciseKey = (name: unknown) => String(name || '').trim().toLowerCase();

export const estimate1Rm = (weight: unknown, reps: unknown): number | null => {
  const w = Number(weight);
  const r = Number(reps);
  if (!Number.isFinite(w) || !Number.isFinite(r) || w <= 0 || r <= 0) return null;
  return w * (1 + r / 30);
};
