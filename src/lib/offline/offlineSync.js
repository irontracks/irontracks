'use client'

import { queueDelete, queueGetAll, queuePut, kvGet, kvSet } from './idb'

const nowIso = () => new Date().toISOString()
const nowMs = () => Date.now()

const DAY_MS = 24 * 60 * 60 * 1000
const JOB_TTL_MS = 14 * DAY_MS
const FAILED_TTL_MS = 7 * DAY_MS
const MAX_ATTEMPTS = 7
const BACKOFF_BASE_MS = 5000
const BACKOFF_MAX_MS = 5 * 60 * 1000

const clamp = (n, min, max) => Math.max(min, Math.min(max, n))

const computeNextAttemptAt = (attempts) => {
  const a = clamp(Number(attempts) || 0, 0, 30)
  const exp = Math.pow(2, Math.max(0, a))
  const base = clamp(BACKOFF_BASE_MS * exp, BACKOFF_BASE_MS, BACKOFF_MAX_MS)
  const jitter = base * (0.15 * (Math.random() * 2 - 1))
  return nowMs() + Math.max(1000, Math.round(base + jitter))
}

const uuid = () => {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  } catch {}
  return `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`
}

const dispatchChanged = () => {
  try {
    window.dispatchEvent(new Event('irontracks.offlineQueueChanged'))
  } catch {}
}

export const isOnline = () => {
  try {
    return typeof navigator !== 'undefined' ? navigator.onLine !== false : true
  } catch {
    return true
  }
}

export const enqueueWorkoutFinishJob = async ({ userId, session, idempotencyKey }) => {
  const uid = String(userId || '').trim()
  if (!uid) return { ok: false, error: 'missing_user' }
  const key = String(idempotencyKey || '').trim() || uuid()
  const ts = nowIso()
  const ms = nowMs()
  const job = {
    id: uuid(),
    type: 'workout_finish',
    userId: uid,
    idempotencyKey: key,
    session: session && typeof session === 'object' ? session : {},
    status: 'pending',
    createdAt: ts,
    updatedAt: ts,
    attempts: 0,
    lastError: '',
    lastAttemptAt: null,
    nextAttemptAt: ms,
    maxAttempts: MAX_ATTEMPTS,
  }
  await queuePut(job)
  dispatchChanged()
  return { ok: true, job }
}

export const getPendingCount = async (userId) => {
  const uid = String(userId || '').trim()
  if (!uid) return 0
  const list = await queueGetAll()
  return list.filter((j) => String(j?.userId || '') === uid && String(j?.status || 'pending') !== 'failed').length
}

export const listOfflineJobs = async ({ userId, includeFailed = true } = {}) => {
  const uid = String(userId || '').trim()
  if (!uid) return []
  const list = await queueGetAll()
  const now = nowMs()
  return list
    .filter((j) => j && typeof j === 'object' && String(j.userId || '') === uid)
    .filter((j) => (includeFailed ? true : String(j?.status || 'pending') !== 'failed'))
    .filter((j) => {
      const createdAt = String(j?.createdAt || '')
      const createdMs = createdAt ? Date.parse(createdAt) : NaN
      if (!Number.isFinite(createdMs)) return true
      return now - createdMs <= JOB_TTL_MS + FAILED_TTL_MS
    })
    .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')))
}

export const clearOfflineJobs = async ({ userId, status } = {}) => {
  const uid = String(userId || '').trim()
  if (!uid) return { ok: false, error: 'missing_user' }
  const list = await queueGetAll()
  const targets = list.filter((j) => String(j?.userId || '') === uid)
    .filter((j) => (status ? String(j?.status || 'pending') === String(status) : true))
  for (const j of targets) {
    try { await queueDelete(j.id) } catch {}
  }
  dispatchChanged()
  return { ok: true, removed: targets.length }
}

export const bumpOfflineJob = async ({ id } = {}) => {
  const key = String(id || '').trim()
  if (!key) return { ok: false, error: 'missing_id' }
  const list = await queueGetAll()
  const job = list.find((j) => String(j?.id || '') === key)
  if (!job) return { ok: false, error: 'not_found' }
  const ts = nowIso()
  const next = { ...job, status: String(job?.status || 'pending') === 'failed' ? 'pending' : String(job?.status || 'pending'), updatedAt: ts, nextAttemptAt: nowMs() }
  await queuePut(next)
  dispatchChanged()
  return { ok: true }
}

export const getOfflineQueueSummary = async ({ userId } = {}) => {
  const uid = String(userId || '').trim()
  if (!uid) return { ok: false, error: 'missing_user', online: isOnline(), pending: 0, failed: 0, due: 0, nextDueAt: null, jobs: [] }
  const now = nowMs()
  const jobs = await listOfflineJobs({ userId: uid, includeFailed: true })
  const pendingJobs = jobs.filter((j) => String(j?.status || 'pending') !== 'failed')
  const failedJobs = jobs.filter((j) => String(j?.status || '') === 'failed')
  const dueJobs = pendingJobs.filter((j) => {
    const nextAt = Number(j?.nextAttemptAt)
    if (!Number.isFinite(nextAt) || nextAt <= 0) return true
    return nextAt <= now
  })
  const nextDueAt = pendingJobs
    .map((j) => Number(j?.nextAttemptAt))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b)[0] ?? null
  return {
    ok: true,
    online: isOnline(),
    pending: pendingJobs.length,
    failed: failedJobs.length,
    due: dueJobs.length,
    nextDueAt: nextDueAt && Number.isFinite(nextDueAt) ? nextDueAt : null,
    jobs: jobs.slice(0, 25),
  }
}

const cleanupQueue = async () => {
  const list = await queueGetAll()
  const now = nowMs()
  for (const j of list) {
    try {
      const id = String(j?.id || '').trim()
      const createdAt = String(j?.createdAt || '')
      const createdMs = createdAt ? Date.parse(createdAt) : NaN
      if (!id) continue
      if (Number.isFinite(createdMs)) {
        const age = now - createdMs
        const status = String(j?.status || 'pending')
        const ttl = status === 'failed' ? (JOB_TTL_MS + FAILED_TTL_MS) : JOB_TTL_MS
        if (age > ttl) {
          await queueDelete(id)
          continue
        }
      }
      const type = String(j?.type || '')
      if (!type) {
        await queueDelete(id)
        continue
      }
    } catch {}
  }
}

export const flushOfflineQueue = async ({ max = 6, force = false } = {}) => {
  if (!isOnline()) return { ok: false, offline: true, flushed: 0 }
  await cleanupQueue()
  const list = await queueGetAll()
  const now = nowMs()
  const jobs = list
    .filter((j) => j && typeof j === 'object' && String(j.type || '') === 'workout_finish')
    .filter((j) => String(j?.status || 'pending') !== 'failed')
    .filter((j) => {
      if (force) return true
      const nextAt = Number(j?.nextAttemptAt)
      if (!Number.isFinite(nextAt) || nextAt <= 0) return true
      return nextAt <= now
    })
    .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')))
    .slice(0, Math.max(1, Math.min(30, Number(max) || 6)))

  let flushed = 0
  let failed = 0
  for (const job of jobs) {
    try {
      const resp = await fetch('/api/workouts/finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session: job.session,
          idempotencyKey: String(job.idempotencyKey || '').trim(),
        }),
      })
      const json = await resp.json().catch(() => null)
      if (!resp.ok || !json?.ok) throw new Error(String(json?.error || `http_${resp.status}`))
      await queueDelete(job.id)
      flushed += 1
      dispatchChanged()
    } catch (e) {
      const msg = e?.message ? String(e.message) : String(e)
      const attemptsNext = Number(job.attempts || 0) + 1
      const ts = nowIso()
      const maxAttempts = Number(job?.maxAttempts) || MAX_ATTEMPTS
      const isFailed = attemptsNext >= maxAttempts
      const next = {
        ...job,
        status: isFailed ? 'failed' : 'pending',
        updatedAt: ts,
        attempts: attemptsNext,
        lastAttemptAt: ts,
        lastError: msg.slice(0, 400),
        nextAttemptAt: isFailed ? null : computeNextAttemptAt(attemptsNext),
        maxAttempts,
      }
      await queuePut(next)
      dispatchChanged()
      failed += 1
      if (!isOnline()) break
    }
  }
  return { ok: true, flushed, failed }
}

export const cacheSetWorkouts = async ({ userId, workouts }) => {
  const uid = String(userId || '').trim()
  if (!uid) return false
  const payload = { ts: Date.now(), workouts: Array.isArray(workouts) ? workouts : [] }
  await kvSet(`workoutsCache.v1.${uid}`, payload)
  return true
}

export const cacheGetWorkouts = async ({ userId }) => {
  const uid = String(userId || '').trim()
  if (!uid) return null
  const data = await kvGet(`workoutsCache.v1.${uid}`)
  if (!data || typeof data !== 'object') return null
  const list = Array.isArray(data.workouts) ? data.workouts : null
  if (!list) return null
  return { workouts: list, ts: Number(data.ts || 0) }
}

export const cacheSetTemplates = async ({ userId, templates }) => {
  const uid = String(userId || '').trim()
  if (!uid) return false
  const payload = { ts: Date.now(), templates: Array.isArray(templates) ? templates : [] }
  await kvSet(`templatesCache.v1.${uid}`, payload)
  return true
}

export const cacheGetTemplates = async ({ userId }) => {
  const uid = String(userId || '').trim()
  if (!uid) return null
  const data = await kvGet(`templatesCache.v1.${uid}`)
  if (!data || typeof data !== 'object') return null
  const list = Array.isArray(data.templates) ? data.templates : null
  if (!list) return null
  return { templates: list, ts: Number(data.ts || 0) }
}
