/**
 * Testes do webhook de pagamento do Asaas
 * (POST /api/marketplace/webhooks/asaas).
 *
 * Contexto: o mapa de cobertura (2026-07-28) apontou este handler sem nenhum
 * teste — ao lado do webhook do Mercado Pago. É por aqui que pagamento vira
 * assinatura ativa e entitlement (acesso pago) do usuário. O webhook da
 * RevenueCat já tinha guards; estes dois não tinham.
 *
 * Invariantes travados:
 *  1. Segredo ausente na config → 500 fail-closed (nunca processa "aberto").
 *  2. Segredo errado/ausente no request → 401, sem escrita.
 *  3. Rate limit por IP → 429 antes de qualquer trabalho.
 *  4. Evento sem id → 400. Sem isso o dedup por unique index é contornável e um
 *     mesmo pagamento pode ser replayado sem limite.
 *  5. Violação de unique (23505) → 200 `deduped`, sem reprocessar.
 *  6. Mapeamento status do pagamento → status da assinatura (dinheiro):
 *     RECEIVED/CONFIRMED = active; OVERDUE = past_due; CANCELED/REFUNDED/
 *     CHARGEBACK = cancelled; desconhecido = pending.
 *  7. REFUNDED/CHARGEBACK NUNCA podem virar assinatura ativa.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const SECRET = 'asaas-test-secret'
vi.hoisted(() => {
  process.env.ASAAS_WEBHOOK_SECRET = 'asaas-test-secret'
})

vi.mock('@/utils/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/utils/cache', () => ({ cacheDelete: vi.fn(async () => {}) }))
vi.mock('@/utils/rateLimit', () => ({
  checkRateLimitAsync: vi.fn(async () => ({ allowed: true })),
  getRequestIp: vi.fn(() => '203.0.113.9'),
}))
vi.mock('@/lib/logger', () => ({ logWarn: vi.fn(), logError: vi.fn(), logInfo: vi.fn() }))

import { createAdminClient } from '@/utils/supabase/admin'
import { checkRateLimitAsync } from '@/utils/rateLimit'
import { POST } from '../route'

type Captures = {
  eventInsert: Record<string, unknown> | null
  subscriptionUpdates: Array<Record<string, unknown>>
  entitlementUpserts: Array<Record<string, unknown>>
  paymentUpdates: Array<Record<string, unknown>>
}

function makeAdmin(opts: { insertError?: { code?: string; message?: string } } = {}) {
  const captures: Captures = {
    eventInsert: null,
    subscriptionUpdates: [],
    entitlementUpserts: [],
    paymentUpdates: [],
  }

  const from = vi.fn((table: string) => {
    const chain: Record<string, unknown> = {}
    const self = () => chain

    chain.select = vi.fn(self)
    chain.eq = vi.fn(self)
    chain.order = vi.fn(self)
    chain.limit = vi.fn(self)
    chain.single = vi.fn(async () => ({ data: { id: 'evt-row-1' }, error: null }))
    chain.maybeSingle = vi.fn(async () => {
      if (table === 'app_subscriptions') {
        return {
          data: {
            user_id: 'user-1',
            plan_id: 'plan-1',
            status: 'active',
            asaas_subscription_id: 'sub_123',
            asaas_customer_id: 'cus_1',
            current_period_start: '2026-07-01T00:00:00Z',
            current_period_end: '2026-08-01T00:00:00Z',
          },
          error: null,
        }
      }
      return { data: { id: 'row-1', subscription_id: 'sub-row-1' }, error: null }
    })

    chain.insert = vi.fn((payload: Record<string, unknown>) => {
      if (table === 'asaas_webhook_events') {
        captures.eventInsert = payload
        if (opts.insertError) {
          return {
            select: vi.fn(() => ({ single: vi.fn(async () => ({ data: null, error: opts.insertError })) })),
          }
        }
        return {
          select: vi.fn(() => ({ single: vi.fn(async () => ({ data: { id: 'evt-row-1' }, error: null })) })),
        }
      }
      return { select: vi.fn(() => ({ single: vi.fn(async () => ({ data: null, error: null })) })) }
    })

    chain.update = vi.fn((payload: Record<string, unknown>) => {
      if (table === 'marketplace_subscriptions' || table === 'app_subscriptions') {
        captures.subscriptionUpdates.push(payload)
      }
      if (table === 'marketplace_payments' || table === 'app_payments') {
        captures.paymentUpdates.push(payload)
      }
      const term: Record<string, unknown> = {}
      term.eq = vi.fn(() => term)
      term.select = vi.fn(() => term)
      term.maybeSingle = vi.fn(async () => ({ data: { id: 'row-1', subscription_id: 'sub-row-1' }, error: null }))
      // `.update().eq()` sem select é awaited direto
      ;(term as unknown as PromiseLike<unknown>).then = ((resolve: (v: unknown) => unknown) =>
        resolve({ error: null })) as PromiseLike<unknown>['then']
      return term
    })

    chain.upsert = vi.fn(async (payload: Record<string, unknown>) => {
      if (table === 'user_entitlements') captures.entitlementUpserts.push(payload)
      return { error: null }
    })

    return chain
  })

  return { client: { from } as unknown as ReturnType<typeof createAdminClient>, captures }
}

const post = (body: unknown, secret?: string) =>
  new Request('https://irontracks.com.br/api/marketplace/webhooks/asaas', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(secret ? { 'x-webhook-secret': secret } : {}),
    },
    body: JSON.stringify(body),
  })

const paymentEvent = (status: string, over: Record<string, unknown> = {}) => ({
  event: 'PAYMENT_CONFIRMED',
  id: `evt_${status}_${Math.round(1000)}`,
  payment: { id: 'pay_1', status, subscription: 'sub_123', ...over },
})

describe('webhook Asaas — autenticação', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('sem header de segredo → 401 e nenhuma escrita', async () => {
    const { client, captures } = makeAdmin()
    vi.mocked(createAdminClient).mockReturnValue(client)

    const res = await POST(post(paymentEvent('CONFIRMED')))

    expect(res.status).toBe(401)
    expect(captures.eventInsert).toBeNull()
  })

  it('segredo não configurado no servidor → 500 fail-closed', async () => {
    // Um deploy sem ASAAS_WEBHOOK_SECRET não pode virar webhook aberto: seria
    // ativar assinatura para quem chamar a URL. `env` lê process.env por getter
    // lazy, então stubEnv já muda o comportamento do handler.
    const { client, captures } = makeAdmin()
    vi.mocked(createAdminClient).mockReturnValue(client)
    vi.stubEnv('ASAAS_WEBHOOK_SECRET', '')

    const res = await POST(post(paymentEvent('CONFIRMED'), SECRET))
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body.error).toBe('webhook_not_configured')
    expect(captures.eventInsert).toBeNull()

    vi.unstubAllEnvs()
  })

  it('segredo errado → 401', async () => {
    const { client } = makeAdmin()
    vi.mocked(createAdminClient).mockReturnValue(client)

    const res = await POST(post(paymentEvent('CONFIRMED'), 'segredo-errado'))

    expect(res.status).toBe(401)
  })

  it('rate limit por IP corta antes de processar', async () => {
    const { client, captures } = makeAdmin()
    vi.mocked(createAdminClient).mockReturnValue(client)
    vi.mocked(checkRateLimitAsync).mockResolvedValueOnce({ allowed: false } as Awaited<ReturnType<typeof checkRateLimitAsync>>)

    const res = await POST(post(paymentEvent('CONFIRMED'), SECRET))

    expect(res.status).toBe(429)
    expect(captures.eventInsert).toBeNull()
  })
})

describe('webhook Asaas — replay e idempotência', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('evento sem id → 400 (senão o dedup por unique index é contornável)', async () => {
    const { client, captures } = makeAdmin()
    vi.mocked(createAdminClient).mockReturnValue(client)

    const res = await POST(post({ event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_1', status: 'CONFIRMED' } }, SECRET))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toBe('missing_event_id')
    expect(captures.eventInsert).toBeNull()
  })

  it('evento repetido (unique 23505) → deduped, sem reprocessar', async () => {
    const { client, captures } = makeAdmin({ insertError: { code: '23505', message: 'duplicate key' } })
    vi.mocked(createAdminClient).mockReturnValue(client)

    const res = await POST(post(paymentEvent('CONFIRMED'), SECRET))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ ok: true, deduped: true })
    expect(captures.subscriptionUpdates).toHaveLength(0)
    expect(captures.entitlementUpserts).toHaveLength(0)
  })

  it('registra o evento cru antes de processar (trilha de auditoria)', async () => {
    const { client, captures } = makeAdmin()
    vi.mocked(createAdminClient).mockReturnValue(client)

    await POST(post(paymentEvent('CONFIRMED'), SECRET))

    expect(captures.eventInsert).toMatchObject({ payment_id: 'pay_1' })
    expect(captures.eventInsert?.payload).toBeTruthy()
  })
})

describe('webhook Asaas — status do pagamento vira status da assinatura', () => {
  beforeEach(() => { vi.clearAllMocks() })

  const cases: Array<[string, string]> = [
    ['RECEIVED', 'active'],
    ['CONFIRMED', 'active'],
    ['OVERDUE', 'past_due'],
    ['CANCELED', 'cancelled'],
    ['CANCELLED', 'cancelled'],
    ['REFUNDED', 'cancelled'],
    ['CHARGEBACK', 'cancelled'],
    ['DELETED', 'cancelled'],
    ['PENDING', 'pending'],
    ['ALGO_NOVO_DO_ASAAS', 'pending'],
  ]

  it.each(cases)('%s → %s', async (paymentStatus, expected) => {
    const { client, captures } = makeAdmin()
    vi.mocked(createAdminClient).mockReturnValue(client)

    await POST(post(paymentEvent(paymentStatus), SECRET))

    expect(captures.subscriptionUpdates.length).toBeGreaterThan(0)
    for (const upd of captures.subscriptionUpdates) {
      expect(upd.status).toBe(expected)
    }
  })

  it('estorno e chargeback NUNCA ativam assinatura', async () => {
    for (const status of ['REFUNDED', 'CHARGEBACK']) {
      vi.clearAllMocks()
      const { client, captures } = makeAdmin()
      vi.mocked(createAdminClient).mockReturnValue(client)

      await POST(post(paymentEvent(status), SECRET))

      const statuses = captures.subscriptionUpdates.map((u) => u.status)
      expect(statuses, status).not.toContain('active')
      const entStatuses = captures.entitlementUpserts.map((u) => u.status)
      expect(entStatuses, status).not.toContain('active')
    }
  })

  it('pagamento confirmado propaga o entitlement do usuário', async () => {
    const { client, captures } = makeAdmin()
    vi.mocked(createAdminClient).mockReturnValue(client)

    await POST(post(paymentEvent('CONFIRMED'), SECRET))

    expect(captures.entitlementUpserts).toHaveLength(1)
    expect(captures.entitlementUpserts[0]).toMatchObject({
      user_id: 'user-1',
      status: 'active',
      provider: 'asaas',
    })
  })
})
