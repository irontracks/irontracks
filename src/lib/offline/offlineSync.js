import { kvGet, kvSet, queuePut, queueGetAll, queueDelete } from './idb';

const CACHE_KEY_WORKOUTS = 'offline_workouts_cache';

export const isOnline = () => {
  return typeof navigator !== 'undefined' && navigator.onLine;
};

export const cacheSetWorkouts = async (workouts) => {
  try {
    await kvSet(CACHE_KEY_WORKOUTS, workouts);
  } catch (e) {
    console.error('Cache set failed', e);
  }
};

export const cacheGetWorkouts = async () => {
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

export const getOfflineQueueSummary = async ({ userId } = {}) => {
  try {
    const all = await queueGetAll();
    const jobs = Array.isArray(all) ? all : [];
    
    // Calculate stats
    const now = Date.now();
    const pending = jobs.filter(j => (j.status || 'pending') === 'pending').length;
    const failed = jobs.filter(j => j.status === 'failed').length;
    const due = jobs.filter(j => !j.nextAttemptAt || j.nextAttemptAt <= now).length;
    
    // Find next due
    const future = jobs.filter(j => j.nextAttemptAt && j.nextAttemptAt > now).sort((a, b) => a.nextAttemptAt - b.nextAttemptAt);
    const nextDueAt = future.length > 0 ? future[0].nextAttemptAt : null;

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

export const clearOfflineJobs = async ({ userId } = {}) => {
    try {
        const all = await queueGetAll();
        if (Array.isArray(all)) {
            for (const job of all) {
                await queueDelete(job.id);
            }
        }
        return { ok: true };
    } catch (e) {
        return { ok: false, error: e };
    }
};

export const bumpOfflineJob = async ({ id }) => {
    try {
        const all = await queueGetAll();
        const job = all.find(j => j.id === id);
        if (job) {
            job.nextAttemptAt = 0;
            job.attempts = 0;
            job.status = 'pending';
            await queuePut(job);
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
    // Check eligibility
    if (!force) {
        if (job.nextAttemptAt && job.nextAttemptAt > now) continue;
        if (job.status === 'failed' && !force) continue; 
    }

    try {
      if (job.type === 'finish_workout') {
        await processFinishWorkout(job);
      }
      // Success
      await queueDelete(job.id);
      processed++;
    } catch (err) {
      console.error('Failed to process offline job:', job, err);
      errors++;
      
      // Update job with failure info
      job.attempts = (job.attempts || 0) + 1;
      job.lastError = String(err?.message || err);
      job.nextAttemptAt = now + (1000 * 60 * Math.pow(2, job.attempts)); // Exponential backoff
      
      if (job.attempts >= (job.maxAttempts || 7)) {
          job.status = 'failed';
      } else {
          job.status = 'pending'; 
      }
      await queuePut(job);
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
