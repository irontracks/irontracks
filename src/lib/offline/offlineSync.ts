
import { kvGet, kvSet, queuePut, queueGetAll, queueDelete } from './idb';
import { logError, logWarn } from '@/lib/logger'
import { clearFinishBackupByIdempotencyKey } from '@/lib/workoutSafetyNet'

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

export const cacheSetWorkouts = async (workouts: unknown, _opts: unknown = null) => {
  try {
    await kvSet(CACHE_KEY_WORKOUTS, workouts);
  } catch (e) {
    logError('error', 'Cache set failed', e);
  }
};

export const cacheGetWorkouts = async (_opts: unknown = null) => {
  try {
    return await kvGet(CACHE_KEY_WORKOUTS);
  } catch {
    return null;
  }
};

export const getPendingCount = async () => {
  try {
    const all = await queueGetAll();
    if (!Array.isArray(all)) return 0;
    // Conta só jobs ELEGÍVEIS (exclui 'failed'). Antes contava tudo: um job
    // 'failed' preso deixava o contador > 0 pra sempre e o auto-flush de 15s
    // disparava eternamente sem fazer nada (dreno de bateria/dados).
    return all.filter((j) => String((j as OfflineJob)?.status || 'pending') !== 'failed').length;
  } catch {
    return 0;
  }
};

const STALE_JOB_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

export const getOfflineQueueSummary = async ({ userId: _userId }: { userId?: string } = {}) => {
  try {
    const all = await queueGetAll();
    const rawJobs = Array.isArray(all) ? (all as OfflineJob[]) : [];

    // Auto-cleanup: remove failed jobs older than 7 days
    const now = Date.now();
    const staleIds: string[] = []
    const jobs = rawJobs.filter((j) => {
      if (String(j?.status || '') === 'failed' && j?.createdAt) {
        const age = now - new Date(j.createdAt).getTime()
        if (age > STALE_JOB_MS) { staleIds.push(String(j.id)); return false }
      }
      return true
    })
    for (const id of staleIds) {
      try { await queueDelete(id) } catch { /* best effort */ }
    }

    // Calculate stats
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

export const clearOfflineJobs = async ({ userId: _userId }: { userId?: string } = {}) => {
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
    logError('error', 'Bump failed', e);
  }
};

// Mutex de MÓDULO compartilhado por TODOS os callers (hook, tarefa de background
// do iOS, botão "Sincronizar", finish, recuperação): sem ele, dois flushes
// simultâneos podiam pegar o MESMO job e enviá-lo duas vezes → duplicata no banco.
let flushInProgress = false

export const flushOfflineQueue = async (opts: { max?: number; force?: boolean } = {}) => {
  const { force = false } = opts;
  if (!isOnline() && !force) return { processed: 0, errors: 0 };
  if (flushInProgress) return { processed: 0, errors: 0, skipped: true };
  flushInProgress = true;
  try {
    return await runFlushOfflineQueue(opts);
  } finally {
    flushInProgress = false;
  }
};

const runFlushOfflineQueue = async ({ max = 50, force = false }: { max?: number; force?: boolean } = {}) => {
  let all: unknown = [];
  try {
    all = await queueGetAll();
  } catch {
    return { processed: 0, errors: 0 };
  }

  if (!Array.isArray(all) || all.length === 0) return { processed: 0, errors: 0 };

  let processed = 0;
  let errors = 0;
  const now = Date.now();

  // Processa na ordem de CRIAÇÃO (não na ordem que o backend devolve — IDB por
  // chave, iOS por rowid, localStorage por push): garante ex. "criar treino"
  // ANTES de "editar treino" do mesmo item feito offline.
  const ordered = [...all].sort((a, b) => {
    const ta = new Date(String((a as OfflineJob)?.createdAt || 0)).getTime() || 0;
    const tb = new Date(String((b as OfflineJob)?.createdAt || 0)).getTime() || 0;
    return ta - tb;
  });

  for (const jobItem of ordered) {
    const j = jobItem && typeof jobItem === 'object' ? (jobItem as OfflineJob) : ({} as OfflineJob)
    // Check eligibility
    if (!force) {
      if (j.nextAttemptAt && Number(j.nextAttemptAt) > now) continue;
      if (String(j.status || '') === 'failed' && !force) continue;
    }

    try {
      const jobType = String(j.type || '')
      if (jobType === 'finish_workout') {
        await processFinishWorkout(j);
      } else if (jobType === 'create_workout') {
        await processCreateWorkout(j);
      } else if (jobType === 'update_workout') {
        await processUpdateWorkout(j);
      } else if (jobType === 'delete_workout') {
        await processDeleteWorkout(j);
      } else if (jobType === 'nutrition_log_local') {
        await processNutritionLogLocal(j);
      } else if (jobType === 'nutrition_log_ai') {
        await processNutritionLogAi(j);
      } else if (jobType === 'nutrition_delete') {
        await processNutritionDelete(j);
      } else if (jobType === 'nutrition_edit') {
        await processNutritionEdit(j);
      } else if (jobType === 'nutrition_water') {
        await processNutritionWater(j);
      } else {
        // Unknown job type — do NOT delete. Log and skip.
        logWarn('offlineSync: unknown job type, skipping:', j.type, j.id);
        continue;
      }
      await queueDelete(String(j.id));
      processed++;
    } catch (err) {
      logError('Failed to process offline job:', j, err);
      errors++;

      // Terminal = 4xx de validação/auth (nunca resolve no retry). Os processors
      // marcam esse caso com "Validation error (4xx)". 408/429/5xx/erro de rede NÃO
      // contêm esse marcador → sobem pro backoff. (Antes um regex /\b4\d{2}\b/ na
      // mensagem inteira marcava 429/408 como terminais e PERDIA o dado.)
      const errMsg = String((err as Error)?.message || err)
      const isTerminal = errMsg.toLowerCase().includes('validation error')

      // Update job with failure info
      const attempts = (Number(j.attempts) || 0) + 1
      const nextAttemptAt = now + (1000 * 60 * Math.pow(2, attempts))
      const nextJob: OfflineJob = { ...j, attempts, lastError: errMsg, nextAttemptAt, status: 'pending' }

      if (isTerminal || attempts >= (Number(j.maxAttempts) || 7)) {
        nextJob.status = 'failed';
      } else {
        nextJob.status = 'pending';
      }
      await queuePut(nextJob);
    }

    // Respeita o limite de lote (`max`, antes ignorado como `_max`): não dispara
    // TODOS os jobs numa rajada que estoura o rate limit (429). O resto vai no
    // próximo flush (tick de 15s / evento 'online').
    if (processed + errors >= max) break;
  }

  // After successful sync, invalidate SW API cache so fresh data is fetched
  if (processed > 0) {
    invalidateSwCache('/api/workouts')
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
    maxAttempts: 5,
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
    // 408 (timeout) e 429 (rate limit) são transitórios → sobem pro backoff (não
    // terminam o job). Só 4xx de validação/auth é terminal.
    if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
      const text = await response.text();
      throw new Error(`Validation error (4xx): ${text}`);
    }
    const errorText = await response.text();
    throw new Error(`API error: ${response.status} - ${errorText}`);
  }

  // Sincronizou com sucesso: limpa o backup local correspondente pra sumir a
  // "recuperação fantasma" no próximo boot. Casa pelo idempotencyKey do payload.
  try {
    const idk = (payload as Record<string, unknown>)?.idempotencyKey;
    if (typeof idk === 'string' && idk) clearFinishBackupByIdempotencyKey(idk);
  } catch { /* best effort */ }
}

// ─── CRUD Job Processors ──────────────────────────────────────────────────────

async function processCreateWorkout(job: OfflineJob) {
  const { payload } = job
  const response = await fetch('/api/workouts/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    const text = await response.text()
    if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) {
      throw new Error(`Validation error (4xx): ${text}`)
    }
    throw new Error(`API error: ${response.status} - ${text}`)
  }
}

async function processUpdateWorkout(job: OfflineJob) {
  const { payload } = job
  const response = await fetch('/api/workouts/update', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    const text = await response.text()
    if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) {
      throw new Error(`Validation error (4xx): ${text}`)
    }
    throw new Error(`API error: ${response.status} - ${text}`)
  }
}

async function processDeleteWorkout(job: OfflineJob) {
  const { payload } = job
  const workoutId = payload?.workoutId || payload?.id
  const response = await fetch(`/api/workouts/delete`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workoutId }),
  })
  if (!response.ok) {
    const text = await response.text()
    if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) {
      throw new Error(`Validation error (4xx): ${text}`)
    }
    throw new Error(`API error: ${response.status} - ${text}`)
  }
}

// ─── CRUD Queue Helpers ───────────────────────────────────────────────────────

export const queueCreateWorkout = async (payload: Record<string, unknown>) => {
  const id = `create_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  const job: OfflineJob = {
    id,
    type: 'create_workout',
    createdAt: new Date().toISOString(),
    payload,
    details: (payload.title as string) || 'Criar Treino',
    status: 'pending',
    attempts: 0,
    maxAttempts: 5,
    nextAttemptAt: 0,
  }
  await queuePut(job)
  return id
}

export const queueUpdateWorkout = async (payload: Record<string, unknown>) => {
  const id = `update_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  const job: OfflineJob = {
    id,
    type: 'update_workout',
    createdAt: new Date().toISOString(),
    payload,
    details: (payload.title as string) || 'Atualizar Treino',
    status: 'pending',
    attempts: 0,
    maxAttempts: 5,
    nextAttemptAt: 0,
  }
  await queuePut(job)
  return id
}

export const queueDeleteWorkout = async (payload: Record<string, unknown>) => {
  const id = `delete_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  const job: OfflineJob = {
    id,
    type: 'delete_workout',
    createdAt: new Date().toISOString(),
    payload,
    details: (payload.title as string) || 'Excluir Treino',
    status: 'pending',
    attempts: 0,
    maxAttempts: 5,
    nextAttemptAt: 0,
  }
  await queuePut(job)
  return id
}

// ─── Nutrition Job Processors ─────────────────────────────────────────────────

/**
 * POST helper para os jobs de nutrição: 4xx vira erro terminal (a fila marca
 * `failed` sem retry); 5xx/erro de rede sobe pra retry com backoff.
 */
async function postNutritionJob(url: string, payload: unknown) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload ?? {}),
  })
  if (!response.ok) {
    const text = await response.text()
    if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) {
      throw new Error(`Validation error (4xx): ${text}`)
    }
    throw new Error(`API error: ${response.status} - ${text}`)
  }
}

async function processNutritionLogLocal(job: OfflineJob) {
  await postNutritionJob('/api/nutrition/log-entry', job.payload)
}

async function processNutritionLogAi(job: OfflineJob) {
  // Alimento fora da base local: a estimativa por IA roda no servidor (online),
  // que resolve os macros, persiste e aprende o alimento pra próxima vez.
  await postNutritionJob('/api/ai/nutrition-estimate', job.payload)
}

async function processNutritionDelete(job: OfflineJob) {
  await postNutritionJob('/api/nutrition/delete-entry', job.payload)
}

async function processNutritionEdit(job: OfflineJob) {
  await postNutritionJob('/api/nutrition/edit-entry', job.payload)
}

async function processNutritionWater(job: OfflineJob) {
  await postNutritionJob('/api/nutrition/water', job.payload)
}

// ─── Nutrition Queue Helpers ──────────────────────────────────────────────────

/**
 * Enfileira um lançamento de refeição feito offline. Usa o `clientId` (uuid
 * otimista da UI) COMO id do job — assim cancelar um lançamento ainda-pendente
 * é só `queueDelete(clientId)`. `needsAi=true` quando o parser local não
 * reconheceu o alimento e os macros só serão calculados na sincronização.
 */
export const queueNutritionLog = async (
  clientId: string,
  payload: Record<string, unknown>,
  needsAi: boolean,
) => {
  const id = String(clientId || '').trim()
  if (!id) return ''
  const job: OfflineJob = {
    id,
    type: needsAi ? 'nutrition_log_ai' : 'nutrition_log_local',
    createdAt: new Date().toISOString(),
    payload,
    details: String(payload.foodName || payload.text || 'Refeição'),
    status: 'pending',
    attempts: 0,
    maxAttempts: 5,
    nextAttemptAt: 0,
  }
  await queuePut(job)
  return id
}

export const queueNutritionDelete = async (payload: Record<string, unknown>) => {
  const id = `ndel_${String(payload.entryId || '')}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  const job: OfflineJob = {
    id,
    type: 'nutrition_delete',
    createdAt: new Date().toISOString(),
    payload,
    details: 'Excluir refeição',
    status: 'pending',
    attempts: 0,
    maxAttempts: 5,
    nextAttemptAt: 0,
  }
  await queuePut(job)
  return id
}

export const queueNutritionEdit = async (payload: Record<string, unknown>) => {
  const id = `nedit_${String(payload.entryId || '')}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  const job: OfflineJob = {
    id,
    type: 'nutrition_edit',
    createdAt: new Date().toISOString(),
    payload,
    details: 'Editar refeição',
    status: 'pending',
    attempts: 0,
    maxAttempts: 5,
    nextAttemptAt: 0,
  }
  await queuePut(job)
  return id
}

/**
 * Água usa id estável por data (`nwater_<dateKey>`) — várias mudanças offline no
 * mesmo dia colapsam num único job (last-write-wins), sem inflar a fila.
 */
export const queueNutritionWater = async (payload: Record<string, unknown>) => {
  const dateKey = String(payload.dateKey || 'today')
  const id = `nwater_${dateKey}`
  const job: OfflineJob = {
    id,
    type: 'nutrition_water',
    createdAt: new Date().toISOString(),
    payload,
    details: 'Atualizar água',
    status: 'pending',
    attempts: 0,
    maxAttempts: 5,
    nextAttemptAt: 0,
  }
  await queuePut(job)
  return id
}

// ─── SW Cache Invalidation Helper ─────────────────────────────────────────────

export function invalidateSwCache(pattern?: string) {
  try {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'CACHE_INVALIDATE',
        pattern: pattern || '',
      })
    }
  } catch { /* best effort */ }
}
