import { kvGet, kvSet, queuePut, queueGetAll, queueDelete } from './idb';

const CACHE_KEY_WORKOUTS = 'offline_workouts_cache';

export const isOnline = () => {
  return typeof navigator !== 'undefined' && navigator.onLine;
};

export const cacheSetWorkouts = async (workouts: any, opts: any = null) => {
  try {
    await kvSet(CACHE_KEY_WORKOUTS, workouts);
  } catch (e) {
    console.error('Cache set failed', e);
  }
};

export const cacheGetWorkouts = async (opts: any = null) => {
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

export const getOfflineQueueSummary = async ({ userId }: any = {}) => {
  try {
    const all = await queueGetAll();
    const jobs = Array.isArray(all) ? (all as Array<Record<string, unknown>>) : [];
    
    // Calculate stats
    const now = Date.now();
    const pending = jobs.filter((j) => String((j as Record<string, unknown>)?.status || 'pending') === 'pending').length;
    const failed = jobs.filter((j) => String((j as Record<string, unknown>)?.status || '') === 'failed').length;
    const due = jobs.filter((j) => {
      const job = j as Record<string, unknown>
      const next = job?.nextAttemptAt
      return !next || Number(next) <= now
    }).length;
    
    // Find next due
    const future = jobs
      .filter((j) => {
        const job = j as Record<string, unknown>
        const next = Number(job?.nextAttemptAt)
        return Number.isFinite(next) && next > now
      })
      .sort((a, b) => Number((a as Record<string, unknown>)?.nextAttemptAt) - Number((b as Record<string, unknown>)?.nextAttemptAt));
    const nextDueAt = future.length > 0 ? Number((future[0] as Record<string, unknown>)?.nextAttemptAt) : null;

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
    return { ok: false, online: isOnline(), jobs: [] };
  }
};

export const clearOfflineJobs = async ({ userId }: any = {}) => {
    try {
        const all = await queueGetAll();
        if (Array.isArray(all)) {
            for (const job of all) {
                const j = job && typeof job === 'object' ? (job as Record<string, unknown>) : ({} as Record<string, unknown>)
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
        const list = Array.isArray(all) ? (all as Array<Record<string, unknown>>) : [];
        const job = list.find((j) => String((j as Record<string, unknown>)?.id || '') === id);
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

  let all = [];
  try {
    all = await queueGetAll();
  } catch (e) {
    return { processed: 0, errors: 0 };
  }

  if (!Array.isArray(all) || all.length === 0) return { processed: 0, errors: 0 };

  let processed = 0;
  let errors = 0;
  const now = Date.now();

  for (const job of all) {
    const j = job && typeof job === 'object' ? (job as Record<string, unknown>) : ({} as Record<string, unknown>)
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
      const nextJob: Record<string, unknown> = { ...j, attempts, lastError: String((err as Record<string, unknown>)?.message || err), nextAttemptAt }
      
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

export const queueFinishWorkout = async (payload) => {
  const id = `finish_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const job = {
    id,
    type: 'finish_workout',
    createdAt: new Date().toISOString(),
    payload,
    details: payload.workoutTitle || 'Treino Finalizado',
    status: 'pending',
    attempts: 0,
    maxAttempts: 10,
    nextAttemptAt: 0 
  };
  await queuePut(job);
  return id;
};

async function processFinishWorkout(job) {
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
