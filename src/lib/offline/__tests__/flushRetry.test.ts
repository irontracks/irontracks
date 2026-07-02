import { describe, it, expect, vi, beforeEach } from 'vitest'

// Fila em memória por trás do mock do idb.
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

import { flushOfflineQueue } from '@/lib/offline/offlineSync'

const mkJob = (id: string, type = 'nutrition_log_local'): Record<string, unknown> => ({
  id, type, createdAt: new Date('2026-01-01T00:00:00Z').toISOString(),
  payload: {}, status: 'pending', attempts: 0, maxAttempts: 5, nextAttemptAt: 0,
})
const mockRes = (status: number, body = '') =>
  ({ ok: status >= 200 && status < 300, status, text: async () => body })

beforeEach(() => {
  queue = []
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true })
})

describe('flushOfflineQueue — 408/429 são retryable (não terminam o job)', () => {
  it('429 (rate limit) mantém o job pending pra retry — NÃO marca failed', async () => {
    queue = [mkJob('n1')]
    globalThis.fetch = vi.fn(async () => mockRes(429, 'rate_limited')) as unknown as typeof fetch
    const r = await flushOfflineQueue({ force: true })
    expect(r.errors).toBe(1)
    expect(queue).toHaveLength(1)
    expect(queue[0].status).toBe('pending')
  })

  it('408 (timeout) também mantém pending', async () => {
    queue = [mkJob('n1b')]
    globalThis.fetch = vi.fn(async () => mockRes(408, 'timeout')) as unknown as typeof fetch
    await flushOfflineQueue({ force: true })
    expect(queue[0].status).toBe('pending')
  })

  it('400 (validação) marca failed (terminal, não retenta)', async () => {
    queue = [mkJob('n2')]
    globalThis.fetch = vi.fn(async () => mockRes(400, 'bad request')) as unknown as typeof fetch
    await flushOfflineQueue({ force: true })
    expect(queue[0].status).toBe('failed')
  })

  it('sucesso (200) remove o job da fila', async () => {
    queue = [mkJob('n3')]
    globalThis.fetch = vi.fn(async () => mockRes(200, 'ok')) as unknown as typeof fetch
    await flushOfflineQueue({ force: true })
    expect(queue).toHaveLength(0)
  })
})

describe('flushOfflineQueue — respeita o limite de lote (max)', () => {
  it('processa no máximo `max` jobs por flush (evita rajada que estoura 429)', async () => {
    queue = Array.from({ length: 20 }, (_, i) => mkJob(`j${i}`))
    const fetchMock = vi.fn(async () => mockRes(200, 'ok'))
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const r = await flushOfflineQueue({ max: 8, force: true })
    expect(r.processed).toBe(8)
    expect(fetchMock).toHaveBeenCalledTimes(8)
    expect(queue).toHaveLength(12)
  })
})
