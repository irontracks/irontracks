import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Trava o fix do CRÍTICO da auditoria da fila offline: a fila é global por device e os
 * jobs eram reenviados com a sessão ATUAL (os endpoints derivam o dono de auth.uid) —
 * num device de academia, o job que A criou offline era gravado na conta de B. Fix:
 * carimbar `userId` no enqueue e, no flush, SEGURAR (não deletar, não queimar tentativa)
 * jobs de outro dono. Também: 401 (token expirado no flush) vira transitório, não terminal
 * (senão um token expirado perdia o treino).
 *
 * Mesma estratégia de mock do flushQueueOrdering.test.ts (fila em memória + fetch stub).
 */
let queue: Array<Record<string, unknown>> = []

vi.mock('@/lib/offline/idb', () => ({
  kvGet: vi.fn(),
  kvSet: vi.fn(),
  queueGetAll: vi.fn(async () => [...queue]),
  queuePut: vi.fn(async (job: Record<string, unknown>) => {
    queue = queue.filter((j) => String(j.id) !== String(job.id))
    queue.push(job)
    return true
  }),
  queueDelete: vi.fn(async (id: unknown) => {
    queue = queue.filter((j) => String(j.id) !== String(id))
    return true
  }),
}))
vi.mock('@/lib/logger', () => ({ logError: vi.fn(), logWarn: vi.fn(), logInfo: vi.fn(), logDebug: vi.fn() }))
vi.mock('@/lib/workoutSafetyNet', () => ({ clearFinishBackupByIdempotencyKey: vi.fn() }))

import {
  flushOfflineQueue,
  setOfflineUser,
  getPendingCount,
  queueNutritionWater,
  queueFinishWorkout,
} from '@/lib/offline/offlineSync'

const mockRes = (status: number, body = '') =>
  ({ ok: status >= 200 && status < 300, status, text: async () => body })

beforeEach(() => {
  queue = []
  vi.clearAllMocks()
  setOfflineUser(null)
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true })
})

afterEach(() => {
  vi.restoreAllMocks()
  setOfflineUser(null)
})

describe('carimba userId no enqueue', () => {
  it('queueNutritionWater grava o dono atual no job', async () => {
    setOfflineUser('user-A')
    await queueNutritionWater({ dateKey: '2026-06-15', ml: 500 })
    expect(queue).toHaveLength(1)
    expect(queue[0].userId).toBe('user-A')
  })

  it('queueFinishWorkout grava o dono atual no job', async () => {
    setOfflineUser('user-A')
    await queueFinishWorkout({ workoutTitle: 'Treino' })
    expect(queue[0].userId).toBe('user-A')
  })
})

describe('flush segura job de OUTRO dono (device compartilhado)', () => {
  it('NÃO reenvia nem deleta job de A quando B está logado', async () => {
    const fetchSpy = vi.fn(async () => mockRes(200) as unknown as Response)
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    queue.push({
      id: 'nwater_2026-06-15', type: 'nutrition_water', createdAt: new Date().toISOString(),
      payload: { dateKey: '2026-06-15' }, status: 'pending', attempts: 0, maxAttempts: 5, nextAttemptAt: 0,
      userId: 'user-A',
    })

    setOfflineUser('user-B')
    const res = await flushOfflineQueue({ force: true })

    expect(fetchSpy).not.toHaveBeenCalled()      // não reenviou o job de A com a sessão de B
    expect(queue).toHaveLength(1)                 // job de A preservado (não deletado)
    expect(queue[0].attempts).toBe(0)            // não queimou tentativa
    expect(res.processed).toBe(0)
  })

  it('reenvia normalmente o job do PRÓPRIO usuário', async () => {
    const fetchSpy = vi.fn(async () => mockRes(200) as unknown as Response)
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    queue.push({
      id: 'nwater_2026-06-15', type: 'nutrition_water', createdAt: new Date().toISOString(),
      payload: { dateKey: '2026-06-15' }, status: 'pending', attempts: 0, maxAttempts: 5, nextAttemptAt: 0,
      userId: 'user-B',
    })

    setOfflineUser('user-B')
    const res = await flushOfflineQueue({ force: true })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(queue).toHaveLength(0)                 // processado e removido
    expect(res.processed).toBe(1)
  })

  it('job legado SEM userId ainda é processado (compat)', async () => {
    const fetchSpy = vi.fn(async () => mockRes(200) as unknown as Response)
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    queue.push({
      id: 'nwater_x', type: 'nutrition_water', createdAt: new Date().toISOString(),
      payload: { dateKey: '2026-06-15' }, status: 'pending', attempts: 0, maxAttempts: 5, nextAttemptAt: 0,
    })
    setOfflineUser('user-B')
    const res = await flushOfflineQueue({ force: true })
    expect(res.processed).toBe(1)
  })
})

describe('getPendingCount escopa ao usuário atual', () => {
  it('conta só os jobs do dono atual (+ legados)', async () => {
    queue.push({ id: 'a1', type: 'nutrition_water', status: 'pending', userId: 'user-A' })
    queue.push({ id: 'b1', type: 'nutrition_water', status: 'pending', userId: 'user-B' })
    queue.push({ id: 'legacy', type: 'nutrition_water', status: 'pending' })
    setOfflineUser('user-B')
    expect(await getPendingCount()).toBe(2) // b1 + legacy, não a1
  })
})

describe('401 no flush é transitório (não perde o dado)', () => {
  it('job de nutrição com 401 fica pending (não failed) e agenda retry', async () => {
    const fetchSpy = vi.fn(async () => mockRes(401, 'unauthorized') as unknown as Response)
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    queue.push({
      id: 'nwater_2026-06-15', type: 'nutrition_water', createdAt: new Date().toISOString(),
      payload: { dateKey: '2026-06-15' }, status: 'pending', attempts: 0, maxAttempts: 5, nextAttemptAt: 0,
      userId: 'user-A',
    })
    setOfflineUser('user-A')
    const res = await flushOfflineQueue({ force: true })

    expect(res.errors).toBe(1)
    expect(queue).toHaveLength(1)                 // não perdeu o job
    expect(queue[0].status).toBe('pending')       // NÃO virou failed
    expect(Number(queue[0].attempts)).toBe(1)     // agendou retry
  })

  it('finish_workout com 401 também fica pending (não failed)', async () => {
    const fetchSpy = vi.fn(async () => mockRes(401, 'unauthorized') as unknown as Response)
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    queue.push({
      id: 'finish_1', type: 'finish_workout', createdAt: new Date().toISOString(),
      payload: { idempotencyKey: 'k1' }, status: 'pending', attempts: 0, maxAttempts: 5, nextAttemptAt: 0,
      userId: 'user-A',
    })
    setOfflineUser('user-A')
    await flushOfflineQueue({ force: true })
    expect(queue[0].status).toBe('pending')
  })
})
