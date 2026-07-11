/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Cobertura da MÁQUINA DE IDEMPOTÊNCIA de POST /api/workouts/finish.
 *
 * A auditoria de cobertura marcou a finalização de treino (idempotente via
 * `finish_idempotency_key` + lock Upstash) como UNTESTED — só os helpers puros
 * eram exercitados em `finishHelpers.test.ts`. Aqui travamos as invariantes de
 * INTEGRIDADE DE DADOS que, se quebrarem, geram treino duplicado, streak/badge
 * forjados ou dedup silenciosamente desligada em produção.
 *
 * Abordagem: teste COMPORTAMENTAL do handler `POST`, com todas as dependências
 * de I/O mockadas (Supabase encadeável no estilo de authRole/checkVipFeatureAccess,
 * cache/Upstash no estilo de flushRetry, `next/server` reduzido a { __body, status }).
 * Complementado por SOURCE-GUARDs (estilo appSubscriptionExpiry) que asseguram que
 * os ramos de proteção continuam presentes no fonte — defesa contra remoção acidental.
 *
 * Invariantes travadas:
 *  1. Upstash indisponível no lock → 503 fail-closed (nunca segue e duplica).
 *  2. 2ª request com a mesma finish_idempotency_key → resultado idempotente,
 *     SEM gravar treino duplicado (nenhum INSERT disparado).
 *  3. Recuperação de 23505 (unique violation) → tratado como idempotente, não 500.
 *  4. Guard MISSING_IDEMPOTENCY_COLUMN → reinsere sem a chave E loga alto
 *     (observabilidade do schema-drift que DESLIGA a dedup).
 *  5. Clamp anti-backdate de 30 dias → datas futuras viram "agora"; datas com mais
 *     de 30 dias viram "30 dias atrás" (protege streak/badge de datas forjadas).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'

// Estado compartilhado hoistado (vi.mock é içado acima dos imports): controla o
// corpo parseado e permite espiar overrides por teste.
const h = vi.hoisted(() => ({ body: {} as Record<string, unknown> }))

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number; headers?: Record<string, string> }) => ({
      __body: body,
      status: init?.status ?? 200,
      headers: init?.headers,
    }),
  },
}))

vi.mock('@/utils/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/utils/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn(() => ({ insert: vi.fn(async () => ({ data: null, error: null })) })),
  })),
}))

vi.mock('@/utils/cache', () => ({
  cacheSetNx: vi.fn(async () => true),
  cacheDeletePattern: vi.fn(async () => {}),
}))

// env.upstash é o MESMO objeto entre testes — mutar as strings simula
// "configurado" vs "offline" sem re-mockar o módulo.
vi.mock('@/utils/env', () => ({
  env: { upstash: { restUrl: '', restToken: '' } },
}))

vi.mock('@/utils/rateLimit', () => ({
  checkRateLimitAsync: vi.fn(async () => ({ allowed: true })),
  getRequestIp: vi.fn(() => '1.2.3.4'),
}))

vi.mock('@/utils/zod', () => ({
  parseJsonBody: vi.fn(async () => ({ data: h.body })),
  parseJsonWithSchema: vi.fn(() => null),
}))

vi.mock('@/lib/logger', () => ({
  logError: vi.fn(),
  logWarn: vi.fn(),
  logInfo: vi.fn(),
  logDebug: vi.fn(),
}))

vi.mock('@/lib/social/workoutNotifications', () => ({ notifyWorkoutFinished: vi.fn(async () => {}) }))
vi.mock('@/utils/report/reportMetrics', () => ({
  buildReportMetrics: vi.fn(() => ({})),
  buildWeeklyVolumeStats: vi.fn(() => ({})),
  buildTrainingLoadFlags: vi.fn(() => ({})),
}))
vi.mock('@/utils/api/dbError', () => ({
  respondDbError: vi.fn(() => ({ __body: { ok: false, error: 'db_error' }, status: 500 })),
}))
vi.mock('@/utils/workoutTitle', () => ({ normalizeWorkoutTitle: (s: string) => s }))
// safeRecord real: devolve o próprio objeto (mutações e Object.keys precisam persistir).
vi.mock('@/utils/guards', () => ({
  safeRecord: (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {}),
}))

// ─── Mock encadeável de Supabase ─────────────────────────────────────────────
// Cada `from()` cria um chain novo (estado didInsert/lookupByKey isolado por query).
// `.maybeSingle()`/`.single()` são terminais; o chain também é thenable (resolve
// { data: [] }) para as queries que terminam em `.limit(...)` ou `.delete().eq(...)`.
type InsertResult = { data: unknown; error: unknown }
function makeSupabase(config: {
  user?: { id: string; email?: string } | null
  insertResults?: InsertResult[]
  idempotencyLookup?: { data: unknown }
}) {
  const insertPayloads: Array<Record<string, unknown>> = []
  const insertResults = config.insertResults ?? [{ data: { id: 'new-id', created_at: 't0' }, error: null }]
  let insertCall = 0

  const from = vi.fn(() => {
    const state = { didInsert: false, lookupByKey: false }
    const chain: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'gte', 'lte', 'order', 'limit', 'delete']) {
      chain[m] = vi.fn((...args: unknown[]) => {
        if (m === 'eq' && args[0] === 'finish_idempotency_key') state.lookupByKey = true
        return chain
      })
    }
    chain.insert = vi.fn((payload: Record<string, unknown>) => {
      insertPayloads.push(payload)
      state.didInsert = true
      return chain
    })
    const resolve = () => {
      if (state.didInsert) {
        const r = insertResults[Math.min(insertCall, insertResults.length - 1)]
        insertCall++
        return r
      }
      if (state.lookupByKey) return config.idempotencyLookup ?? { data: null }
      return { data: null }
    }
    chain.maybeSingle = vi.fn(async () => resolve())
    chain.single = vi.fn(async () => resolve())
    chain.then = (onF: (v: InsertResult) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(onF, onR)
    return chain
  })

  const auth = {
    getUser: vi.fn(async () => ({
      data: { user: config.user === undefined ? { id: 'user-1', email: 'a@b.com' } : config.user },
    })),
  }
  return { from, auth, insertPayloads }
}

const baseSession = (over: Record<string, unknown> = {}) => ({
  workoutTitle: 'Treino de Teste',
  date: new Date().toISOString(),
  exercises: [],
  ...over,
})

async function callPost() {
  const { POST } = await import('@/app/api/workouts/finish/route')
  const req = { headers: { get: () => null } } as unknown as Request
  return (await POST(req)) as unknown as { __body: Record<string, unknown>; status: number; headers?: Record<string, string> }
}

async function setSupabase(config: Parameters<typeof makeSupabase>[0]) {
  const sb = makeSupabase(config)
  const { createClient } = await import('@/utils/supabase/server')
  vi.mocked(createClient).mockResolvedValue(sb as never)
  return sb
}

beforeEach(async () => {
  vi.clearAllMocks()
  const { env } = await import('@/utils/env')
  env.upstash.restUrl = ''
  env.upstash.restToken = ''
  h.body = {}
})

// ─────────────────────────────────────────────────────────────────────────────
// Invariante 1 — Upstash indisponível no lock → 503 fail-closed
// ─────────────────────────────────────────────────────────────────────────────
describe('idempotência — Upstash offline no lock responde 503 (fail-closed)', () => {
  it('cacheSetNx=false + Upstash NÃO configurado → 503 e nenhum INSERT', async () => {
    const { cacheSetNx } = await import('@/utils/cache')
    vi.mocked(cacheSetNx).mockResolvedValueOnce(false)
    // env.upstash permanece vazio (beforeEach) → upstashConfigured=false → fail-closed
    const sb = await setSupabase({})
    h.body = { session: baseSession(), idempotencyKey: 'KEY-503' }

    const res = await callPost()

    expect(res.status).toBe(503)
    expect(res.__body.error).toBe('idempotency_service_unavailable')
    expect(res.headers?.['Retry-After']).toBe('5')
    // fail-closed: jamais grava treino sem garantia de idempotência
    expect(sb.insertPayloads).toHaveLength(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Invariante 2 — 2ª request com a mesma chave → resultado idempotente
// ─────────────────────────────────────────────────────────────────────────────
describe('idempotência — request duplicada retorna o mesmo treino (sem duplicar)', () => {
  it('cacheSetNx=false + Upstash configurado + lookup acha → 200 idempotent, sem INSERT', async () => {
    const { cacheSetNx } = await import('@/utils/cache')
    vi.mocked(cacheSetNx).mockResolvedValueOnce(false)
    const { env } = await import('@/utils/env')
    env.upstash.restUrl = 'https://x.upstash.io'
    env.upstash.restToken = 'tok'

    const sb = await setSupabase({ idempotencyLookup: { data: { id: 'existing-1', created_at: 't1' } } })
    h.body = { session: baseSession(), idempotencyKey: 'KEY-DUP' }

    const res = await callPost()

    expect(res.status).toBe(200)
    expect(res.__body.ok).toBe(true)
    expect(res.__body.idempotent).toBe(true)
    expect((res.__body.saved as { id: string }).id).toBe('existing-1')
    // A 2ª request NÃO pode inserir de novo
    expect(sb.insertPayloads).toHaveLength(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Invariante 3 — Recuperação de 23505 (unique violation) → idempotente, não 500
// ─────────────────────────────────────────────────────────────────────────────
describe('idempotência — corrida no INSERT (23505) é tratada como idempotente', () => {
  it('INSERT viola unique + lookup acha o registro → ok idempotent, NÃO 500', async () => {
    const sb = await setSupabase({
      insertResults: [{ data: null, error: { code: '23505', message: 'duplicate key value' } }],
      idempotencyLookup: { data: { id: 'existing-3', created_at: 't3' } },
    })
    h.body = { session: baseSession(), idempotencyKey: 'KEY-23505' }

    const res = await callPost()

    expect(res.status).toBe(200)
    expect(res.__body.ok).toBe(true)
    expect(res.__body.idempotent).toBe(true)
    expect((res.__body.saved as { id: string }).id).toBe('existing-3')
    // tentou inserir 1x (a corrida), não reinsere depois de achar o existente
    expect(sb.insertPayloads).toHaveLength(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Invariante 4 — Guard MISSING_IDEMPOTENCY_COLUMN (schema-drift)
// ─────────────────────────────────────────────────────────────────────────────
describe('idempotência — coluna ausente reinsere sem a chave E loga alto', () => {
  it('erro "finish_idempotency_key does not exist" → 2º INSERT sem a chave + logError', async () => {
    const sb = await setSupabase({
      insertResults: [
        { data: null, error: { message: 'column workouts.finish_idempotency_key does not exist' } },
        { data: { id: 'new-4', created_at: 't4' }, error: null },
      ],
    })
    h.body = { session: baseSession(), idempotencyKey: 'KEY-MISSING' }

    const res = await callPost()

    expect(res.status).toBe(200)
    expect(res.__body.ok).toBe(true)
    expect(res.__body.idempotent).toBe(false)
    expect((res.__body.saved as { id: string }).id).toBe('new-4')

    // 1º payload COM a chave, 2º payload SEM (dedup desligada por schema-drift)
    expect(sb.insertPayloads).toHaveLength(2)
    expect(sb.insertPayloads[0]).toHaveProperty('finish_idempotency_key', 'KEY-MISSING')
    expect(sb.insertPayloads[1]).not.toHaveProperty('finish_idempotency_key')

    // Observabilidade: precisa gritar no Sentry via logError com a tag do guard
    const { logError } = await import('@/lib/logger')
    const tags = vi.mocked(logError).mock.calls.map((c) => c[0])
    expect(tags).toContain('api:workouts:finish:MISSING_IDEMPOTENCY_COLUMN')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Invariante 5 — Clamp anti-backdate de 30 dias
// ─────────────────────────────────────────────────────────────────────────────
describe('anti-backdate — data gravada é clampada em [30 dias atrás, agora]', () => {
  const DAY = 24 * 60 * 60 * 1000

  it('data futura → clampada para "agora" (não permite antecipar streak)', async () => {
    const sb = await setSupabase({})
    const future = new Date(Date.now() + 10 * DAY).toISOString()
    h.body = { session: baseSession({ date: future }) }

    await callPost()

    expect(sb.insertPayloads).toHaveLength(1)
    const saved = new Date(sb.insertPayloads[0].date as Date).getTime()
    // clampada para ~agora (tolerância de 5s), nunca no futuro distante
    expect(saved).toBeLessThanOrEqual(Date.now() + 5000)
    expect(saved).toBeGreaterThan(Date.now() - 60_000)
  })

  it('data com >30 dias → clampada para "30 dias atrás" (não permite backdate profundo)', async () => {
    const sb = await setSupabase({})
    const old = new Date(Date.now() - 60 * DAY).toISOString()
    h.body = { session: baseSession({ date: old }) }

    await callPost()

    const saved = new Date(sb.insertPayloads[0].date as Date).getTime()
    const thirtyAgo = Date.now() - 30 * DAY
    // clampada para a janela de 30 dias, não os 60 dias forjados
    expect(saved).toBeGreaterThan(thirtyAgo - 5000)
    expect(saved).toBeLessThan(thirtyAgo + 5000)
  })

  it('data dentro da janela (5 dias atrás) → preservada sem clamp', async () => {
    const sb = await setSupabase({})
    const recent = new Date(Date.now() - 5 * DAY)
    h.body = { session: baseSession({ date: recent.toISOString() }) }

    await callPost()

    const saved = new Date(sb.insertPayloads[0].date as Date).getTime()
    expect(Math.abs(saved - recent.getTime())).toBeLessThan(5000)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// SOURCE-GUARDs — asseguram que os ramos de proteção seguem no fonte
// (defesa contra remoção acidental do código de integridade).
// ─────────────────────────────────────────────────────────────────────────────
describe('source-guard — ramos de integridade presentes em route.ts', () => {
  const src = readFileSync('src/app/api/workouts/finish/route.ts', 'utf8')

  it('mantém o 503 fail-closed quando Upstash não está configurado', () => {
    expect(src).toMatch(/upstashConfigured/)
    expect(src).toMatch(/idempotency_service_unavailable/)
    expect(src).toMatch(/status:\s*503/)
  })

  it('mantém a recuperação de 23505 como idempotente', () => {
    expect(src).toMatch(/code === '23505'/)
  })

  it('mantém o guard observável MISSING_IDEMPOTENCY_COLUMN', () => {
    expect(src).toMatch(/api:workouts:finish:MISSING_IDEMPOTENCY_COLUMN/)
  })

  it('mantém o clamp anti-backdate de 30 dias', () => {
    expect(src).toMatch(/30 \* 24 \* 60 \* 60 \* 1000/)
  })
})
