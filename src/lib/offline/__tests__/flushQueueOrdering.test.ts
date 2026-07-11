import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Cobre invariantes de `flushOfflineQueue` (src/lib/offline/offlineSync.ts) que o
 * `flushRetry.test.ts` NÃO exercita — ele foca em 408/429/400/limite de lote.
 *
 * Aqui travamos 4 invariantes do replay da fila offline:
 *  1. Ordenação por `createdAt` ascendente ANTES de processar — garante que o
 *     "criar treino" roda antes do "editar treino" do mesmo item feito offline
 *     (comentário marcado como crítico em offlineSync.ts ~177-184). Se a ordem
 *     inverter, o edit bate num item que ainda não existe no servidor.
 *  2. Backoff exponencial (`now + 60000 * 2^attempts`) + ao atingir `maxAttempts`
 *     o job vira `failed` (não fica em loop infinito de retry).
 *  3. Gating `nextAttemptAt`: job agendado pro futuro é PULADO nesta passada
 *     (sem `force`) — respeita o backoff em vez de martelar o servidor.
 *  4. Tipo de job desconhecido → pula e NÃO deleta (não perde dado do usuário).
 *
 * Mesma estratégia de mock do `flushRetry.test.ts`: fila em memória por trás do
 * mock de `@/lib/offline/idb`, `fetch` global stubado.
 */

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
import { logWarn } from '@/lib/logger'

const mkJob = (
  id: string,
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> => ({
  id,
  type: 'nutrition_log_local',
  createdAt: new Date('2026-01-01T00:00:00Z').toISOString(),
  payload: {},
  status: 'pending',
  attempts: 0,
  maxAttempts: 5,
  nextAttemptAt: 0,
  ...overrides,
})

const mockRes = (status: number, body = '') =>
  ({ ok: status >= 200 && status < 300, status, text: async () => body })

beforeEach(() => {
  queue = []
  vi.clearAllMocks()
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('flushOfflineQueue — ordena por createdAt (create antes do edit)', () => {
  it('processa o job mais antigo primeiro mesmo enfileirado por último', async () => {
    // update foi ENFILEIRADO primeiro no array, mas tem createdAt MAIS RECENTE.
    // create foi enfileirado depois, mas com createdAt MAIS ANTIGO.
    // A ordenação por createdAt deve rodar o create (/create) antes do update (/update).
    queue = [
      mkJob('edit1', {
        type: 'update_workout',
        createdAt: new Date('2026-01-01T00:00:05Z').toISOString(),
      }),
      mkJob('create1', {
        type: 'create_workout',
        createdAt: new Date('2026-01-01T00:00:00Z').toISOString(),
      }),
    ]
    const calledUrls: string[] = []
    globalThis.fetch = vi.fn(async (url: unknown) => {
      calledUrls.push(String(url))
      return mockRes(200, 'ok')
    }) as unknown as typeof fetch

    const r = await flushOfflineQueue({ force: true })

    expect(r.processed).toBe(2)
    expect(calledUrls).toHaveLength(2)
    expect(calledUrls[0]).toContain('/api/workouts/create')
    expect(calledUrls[1]).toContain('/api/workouts/update')
    expect(queue).toHaveLength(0)
  })
})

describe('flushOfflineQueue — backoff exponencial + maxAttempts vira failed', () => {
  it('erro transitório (500) incrementa attempts e agenda nextAttemptAt = now + 60000*2^attempts', async () => {
    const NOW = 1_800_000_000_000
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
    queue = [mkJob('b1', { attempts: 0, maxAttempts: 5 })]
    globalThis.fetch = vi.fn(async () => mockRes(500, 'server error')) as unknown as typeof fetch

    const r = await flushOfflineQueue({ force: true })

    expect(r.errors).toBe(1)
    expect(queue).toHaveLength(1)
    expect(queue[0].attempts).toBe(1)
    expect(queue[0].status).toBe('pending')
    // attempts=1 → 60000 * 2^1 = 120000
    expect(queue[0].nextAttemptAt).toBe(NOW + 120_000)
  })

  it('backoff cresce exponencialmente com attempts (2^n)', async () => {
    const NOW = 1_800_000_000_000
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
    queue = [mkJob('b2', { attempts: 2, maxAttempts: 9 })]
    globalThis.fetch = vi.fn(async () => mockRes(500, 'server error')) as unknown as typeof fetch

    await flushOfflineQueue({ force: true })

    // attempts vira 3 → 60000 * 2^3 = 480000
    expect(queue[0].attempts).toBe(3)
    expect(queue[0].nextAttemptAt).toBe(NOW + 480_000)
  })

  it('ao atingir maxAttempts o job vira failed (para o loop de retry)', async () => {
    queue = [mkJob('b3', { attempts: 4, maxAttempts: 5 })]
    globalThis.fetch = vi.fn(async () => mockRes(500, 'server error')) as unknown as typeof fetch

    await flushOfflineQueue({ force: true })

    // attempts 4 → 5, 5 >= maxAttempts(5) → failed (mesmo sendo erro transitório)
    expect(queue).toHaveLength(1)
    expect(queue[0].attempts).toBe(5)
    expect(queue[0].status).toBe('failed')
  })
})

describe('flushOfflineQueue — gating nextAttemptAt (pula jobs agendados pro futuro)', () => {
  it('sem force, job com nextAttemptAt no futuro é pulado (não chama fetch)', async () => {
    const future = Date.now() + 60 * 60 * 1000 // +1h
    queue = [mkJob('g1', { nextAttemptAt: future })]
    const fetchMock = vi.fn(async () => mockRes(200, 'ok'))
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const r = await flushOfflineQueue() // sem force → respeita o gating

    expect(fetchMock).not.toHaveBeenCalled()
    expect(r.processed).toBe(0)
    expect(r.errors).toBe(0)
    // Job continua na fila, intacto, aguardando a janela do backoff.
    expect(queue).toHaveLength(1)
    expect(queue[0].id).toBe('g1')
  })
})

describe('flushOfflineQueue — tipo desconhecido é pulado sem deletar', () => {
  it('job de tipo desconhecido não chama fetch, NÃO é deletado e loga warn', async () => {
    queue = [mkJob('u1', { type: 'tipo_inexistente' })]
    const fetchMock = vi.fn(async () => mockRes(200, 'ok'))
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const r = await flushOfflineQueue({ force: true })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(r.processed).toBe(0)
    expect(r.errors).toBe(0)
    // Dado preservado: o job continua na fila (não some silenciosamente).
    expect(queue).toHaveLength(1)
    expect(queue[0].id).toBe('u1')
    expect(logWarn).toHaveBeenCalled()
  })
})
