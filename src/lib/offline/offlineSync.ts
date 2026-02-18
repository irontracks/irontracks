
import { kvGet, kvSet, queuePut, queueGetAll, queueDelete } from './idb';

const CACHE_KEY_WORKOUTS = 'offline_workouts_cache';

export interface OfflineJob extends Record<string, unknown> {
  id: string
  type: string
  status: 'pending' | 'failed' | 'processing' | 'done'
  createdAt?: string
  payload?: Record<string, unknown>
  details?: string
  attempts?: number
  maxAttempts?: number
  nextAttemptAt?: number
  lastError?: string
}

export interface QueueSummary {
  ok: boolean
  online: boolean
  pending?: number
  failed?: number
  due?: number
  nextDueAt?: number | null
  jobs: OfflineJob[]
  error?: unknown
}

export const isOnline = () => {
  return typeof navigator !== 'undefined' && navigator.onLine;
};

export const cacheSetWorkouts = async (workouts: unknown, opts: unknown = null) => {
  try {
    await kvSet(CACHE_KEY_WORKOUTS, workouts);
  } catch (e) {
    console.error('Cache set failed', e);
  }
};

export const cacheGetWorkouts = async (opts: unknown = null) => {
  try {
    return await kvGet(CACHE_KEY_WORKOUTS);
  } catch (e) {
    return null;
  }
};

export const getPendingCount = async () => {
  try {
    const all = await queueGetAll();
    return Array.isArray(all) ? all.length : 0;
  } catch (e) {
    return 0;
  }
};

export const getOfflineQueueSummary = async ({ userId }: { userId?: string } = {}) => {
  try {
    const all = await queueGetAll();
    const jobs = Array.isArray(all) ? (all as OfflineJob[]) : [];

    // Calculate stats
    const now = Date.now();
    const pending = jobs.filter((j) => String(j?.status || 'pending') === 'pending').length;
    const failed = jobs.filter((j) => String(j?.status || '') === 'failed').length;
    const due = jobs.filter((j) => {
      const next = j?.nextAttemptAt
      return !next || Number(next) <= now
    }).length;

    // Find next due
    const future = jobs
      .filter((j) => {
        const next = Number(j?.nextAttemptAt)
        return Number.isFinite(next) && next > now
      })
      .sort((a, b) => Number(a?.nextAttemptAt) - Number(b?.nextAttemptAt));
    const nextDueAt = future.length > 0 ? Number(future[0]?.nextAttemptAt) : null;

    return {
      ok: true,
      online: isOnline(),
      pending,
      failed,
      due,
      nextDueAt,
      jobs
    };
  } catch (e) {
    return { ok: false, online: isOnline(), jobs: [] as OfflineJob[], error: e };
  }
};

export const clearOfflineJobs = async ({ userId }: { userId?: string } = {}) => {
  try {
    const all = await queueGetAll();
    if (Array.isArray(all)) {
      for (const job of all) {
        const j = job && typeof job === 'object' ? (job as OfflineJob) : ({} as OfflineJob)
        await queueDelete(String(j.id));
      }
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e };
  }
};

export const bumpOfflineJob = async ({ id }: { id: string }) => {
  try {
    const all = await queueGetAll();
    const list = Array.isArray(all) ? (all as OfflineJob[]) : [];
    const job = list.find((j) => String(j?.id || '') === id);
    if (job) {
      const next = { ...job, nextAttemptAt: 0, attempts: 0, status: 'pending' }
      await queuePut(next);
    }
  } catch (e) {
    console.error('Bump failed', e);
  }
};

export const flushOfflineQueue = async ({ max = 50, force = false } = {}) => {
  if (!isOnline() && !force) return { processed: 0, errors: 0 };

  let all: unknown = [];
  try {
    all = await queueGetAll();
  } catch (e) {
    return { processed: 0, errors: 0 };
  }

  if (!Array.isArray(all) || all.length === 0) return { processed: 0, errors: 0 };

  let processed = 0;
  let errors = 0;
  const now = Date.now();

  for (const jobItem of all) {
    const j = jobItem && typeof jobItem === 'object' ? (jobItem as OfflineJob) : ({} as OfflineJob)
    // Check eligibility
    if (!force) {
      if (j.nextAttemptAt && Number(j.nextAttemptAt) > now) continue;
      if (String(j.status || '') === 'failed' && !force) continue;
    }

    try {
      if (String(j.type || '') === 'finish_workout') {
        await processFinishWorkout(j);
      }
      // Success
      await queueDelete(String(j.id));
      processed++;
    } catch (err) {
      console.error('Failed to process offline job:', j, err);
      errors++;

      // Update job with failure info
      const attempts = (Number(j.attempts) || 0) + 1
      const nextAttemptAt = now + (1000 * 60 * Math.pow(2, attempts))
      const nextJob: OfflineJob = { ...j, attempts, lastError: String((err as Error)?.message || err), nextAttemptAt, status: 'pending' }

      if (attempts >= (Number(j.maxAttempts) || 7)) {
        nextJob.status = 'failed';
      } else {
        nextJob.status = 'pending';
      }
      await queuePut(nextJob);
    }
  }

  return { processed, errors };
};

export const queueFinishWorkout = async (payload: Record<string, unknown>) => {
  const id = `finish_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const job: OfflineJob = {
    id,
    type: 'finish_workout',
    createdAt: new Date().toISOString(),
    payload,
    details: (payload.workoutTitle as string) || 'Treino Finalizado',
    status: 'pending',
    attempts: 0,
    maxAttempts: 10,
    nextAttemptAt: 0
  };
  await queuePut(job);
  return id;
};

async function processFinishWorkout(job: OfflineJob) {
  const { payload } = job;

  const response = await fetch('/api/workouts/finish', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const status = response.status;
    if (status >= 400 && status < 500) {
      const text = await response.text();
      throw new Error(`Validation error (4xx): ${text}`);
    }
    const errorText = await response.text();
    throw new Error(`API error: ${response.status} - ${errorText}`);
  }
}
