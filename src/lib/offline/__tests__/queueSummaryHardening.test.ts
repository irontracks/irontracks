import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Hardening de getOfflineQueueSummary (auditoria da fila offline):
 *  - GC de 7 dias só apaga failed COM rede de segurança (finish_workout tem backup em
 *    workoutSafetyNet). Jobs de NUTRIÇÃO failed são preservados — antes sumiam
 *    silenciosamente (perda de lançamento de refeição).
 *  - `due` NÃO conta jobs failed (nunca são reprocessados) — antes inflava o contador.
 */
let queue: Array<Record<string, unknown>> = []

vi.mock('@/lib/offline/idb', () => ({
  kvGet: vi.fn(),
  kvSet: vi.fn(),
  queueGetAll: vi.fn(async () => [...queue]),
  queuePut: vi.fn(async (job: Record<string, unknown>) => {
    queue = queue.filter((j) => String(j.id) !== String(job.id)); queue.push(job); return true
  }),
  queueDelete: vi.fn(async (id: unknown) => { queue = queue.filter((j) => String(j.id) !== String(id)); return true }),
}))
vi.mock('@/lib/logger', () => ({ logError: vi.fn(), logWarn: vi.fn(), logInfo: vi.fn(), logDebug: vi.fn() }))
vi.mock('@/lib/workoutSafetyNet', () => ({ clearFinishBackupByIdempotencyKey: vi.fn() }))

import { getOfflineQueueSummary, setOfflineUser } from '@/lib/offline/offlineSync'

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString()

beforeEach(() => { queue = []; vi.clearAllMocks(); setOfflineUser(null); Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true }) })
afterEach(() => { vi.restoreAllMocks(); setOfflineUser(null) })

describe('GC de 7 dias — só apaga failed com rede de segurança', () => {
  it('preserva nutrição failed velha; remove finish_workout failed velho', async () => {
    queue = [
      { id: 'n1', type: 'nutrition_water', status: 'failed', createdAt: daysAgo(8), userId: 'u' },
      { id: 'f1', type: 'finish_workout', status: 'failed', createdAt: daysAgo(8), userId: 'u' },
    ]
    setOfflineUser('u')
    await getOfflineQueueSummary({ userId: 'u' })
    expect(queue.some((j) => j.id === 'n1')).toBe(true)  // nutrição preservada (sem backup)
    expect(queue.some((j) => j.id === 'f1')).toBe(false) // finish removido (tem backup)
  })

  it('não apaga nutrição failed recente (< 7 dias)', async () => {
    queue = [{ id: 'n2', type: 'nutrition_log_local', status: 'failed', createdAt: daysAgo(1), userId: 'u' }]
    setOfflineUser('u')
    await getOfflineQueueSummary({ userId: 'u' })
    expect(queue.some((j) => j.id === 'n2')).toBe(true)
  })
})

describe('contador due exclui failed', () => {
  it('conta só pending due, não os failed', async () => {
    queue = [
      { id: 'p1', type: 'nutrition_water', status: 'pending', nextAttemptAt: 0, userId: 'u' },
      { id: 'fa1', type: 'nutrition_water', status: 'failed', nextAttemptAt: 0, userId: 'u' },
    ]
    setOfflineUser('u')
    const sum = await getOfflineQueueSummary({ userId: 'u' })
    expect(sum.pending).toBe(1)
    expect(sum.failed).toBe(1)
    expect(sum.due).toBe(1) // só p1; fa1 (failed) não é "due"
  })
})
