/**
 * Guards do A7 (auditoria de cobranças 14/08/2026) — cancel-active/cancel-pending.
 *
 * Os três defeitos que estes testes travam:
 *  1. Falha no provedor era só LOGADA e o banco local virava 'cancelled' mesmo
 *     assim — o app dizia "assinatura cancelada" com o MP ainda cobrando.
 *     Agora: provedor falhou (e não está já-cancelado lá) → 502, zero escrita.
 *  2. A revogação derrubava TODOS os entitlements ativos do usuário, de
 *     qualquer provedor (um cancelamento MP apagava um VIP Apple).
 *     Agora: só os entitlements da assinatura cancelada são tocados.
 *  3. A revogação era imediata (valid_until = agora) sem respeitar o período
 *     já pago. Agora: entitlement com janela finita NÃO é tocado (expira
 *     sozinho); só valid_until NULL ganha um fim (current_period_end ou agora).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/utils/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/utils/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/mercadopago', () => ({ mercadopagoRequest: vi.fn() }))
vi.mock('@/utils/cache', () => ({ cacheDelete: vi.fn(async () => {}) }))
vi.mock('@/utils/rateLimit', () => ({
  checkRateLimitAsync: vi.fn(async () => ({ allowed: true })),
  getRequestIp: vi.fn(() => '203.0.113.11'),
}))
vi.mock('@/lib/logger', () => ({ logWarn: vi.fn(), logError: vi.fn(), logInfo: vi.fn() }))

import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { mercadopagoRequest } from '@/lib/mercadopago'
import { POST as cancelActive } from '../cancel-active/route'
import { POST as cancelPending } from '../cancel-pending/route'

type Write = { table: string; op: string; payload: Record<string, unknown>; filters: Record<string, unknown> }
type Captures = { writes: Write[] }

function makeAdmin(cfg: {
  sub?: Record<string, unknown> | null
  ents?: Array<Record<string, unknown>>
} = {}) {
  const captures: Captures = { writes: [] }
  const from = vi.fn((table: string) => {
    const chain: Record<string, unknown> = {}
    const self = () => chain
    const readFilters: Record<string, unknown> = {}
    chain.select = vi.fn(self)
    chain.eq = vi.fn((col: string, val: unknown) => { readFilters[col] = val; return chain })
    chain.in = vi.fn(self)
    chain.order = vi.fn(self)
    chain.limit = vi.fn(self)
    chain.maybeSingle = vi.fn(async () => {
      if (table === 'app_subscriptions') return { data: cfg.sub ?? null, error: null }
      return { data: null, error: null }
    })
    // A leitura da lista de entitlements é awaited direto (sem maybeSingle) e o
    // mock RESPEITA os filtros .eq() — sem isso, remover o escopo da query no
    // código deixava o teste verde (guard falso pego na prova por mutação).
    const matchRows = () =>
      (cfg.ents ?? []).filter((row) =>
        Object.entries(readFilters).every(([col, val]) => !(col in row) || row[col] === val))
    ;(chain as unknown as PromiseLike<unknown>).then = ((resolve: (v: unknown) => unknown) =>
      resolve({ data: table === 'user_entitlements' ? matchRows() : [], error: null })) as PromiseLike<unknown>['then']
    chain.update = vi.fn((payload: Record<string, unknown>) => {
      const write: Write = { table, op: 'update', payload, filters: {} }
      captures.writes.push(write)
      const term: Record<string, unknown> = {}
      term.eq = vi.fn((col: string, val: unknown) => { write.filters[col] = val; return term })
      term.in = vi.fn(() => term)
      ;(term as unknown as PromiseLike<unknown>).then = ((resolve: (v: unknown) => unknown) =>
        resolve({ error: null })) as PromiseLike<unknown>['then']
      return term
    })
    return chain
  })
  return { client: { from } as unknown as ReturnType<typeof createAdminClient>, captures }
}

const writesTo = (c: Captures, table: string) => c.writes.filter((w) => w.table === table)

const MP_SUB = {
  id: 'sub-1',
  user_id: 'user-1',
  plan_id: 'vip_pro',
  status: 'active',
  provider: 'mercadopago',
  provider_subscription_id: 'presub-1',
  asaas_subscription_id: null,
  metadata: {},
}

function makeAuthed() {
  return {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
  } as unknown as Awaited<ReturnType<typeof createClient>>
}

const post = () =>
  new Request('https://irontracks.com.br/api/app/subscriptions/cancel-active', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  })

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(createClient).mockResolvedValue(makeAuthed())
  vi.mocked(mercadopagoRequest).mockResolvedValue({} as never)
})

describe('cancel-active — o provedor confirma ANTES do estado local (A7.1)', () => {
  it('provedor falhou (e a assinatura segue viva lá) → 502 e NENHUMA escrita', async () => {
    const { client, captures } = makeAdmin({ sub: MP_SUB })
    vi.mocked(createAdminClient).mockReturnValue(client)
    vi.mocked(mercadopagoRequest).mockImplementation(async (opts) => {
      if (opts.method === 'PUT') throw new Error('mp fora do ar')
      return { status: 'authorized' } as never // GET: ainda viva no provedor
    })

    const res = await cancelActive(post())

    expect(res.status).toBe(502)
    expect(captures.writes).toHaveLength(0)
  })

  it('PUT falhou mas o provedor mostra que JÁ está cancelada → estado local avança', async () => {
    const { client, captures } = makeAdmin({ sub: MP_SUB })
    vi.mocked(createAdminClient).mockReturnValue(client)
    vi.mocked(mercadopagoRequest).mockImplementation(async (opts) => {
      if (opts.method === 'PUT') throw new Error('preapproval already cancelled')
      return { status: 'cancelled' } as never
    })

    const res = await cancelActive(post())
    const body = await res.json()

    expect(body).toMatchObject({ ok: true, cancelled: true })
    const sub = writesTo(captures, 'app_subscriptions').find((w) => w.payload.status === 'cancelled')
    expect(sub?.filters.id).toBe('sub-1')
  })

  it('sucesso no provedor → marca cancelado LOCAL com cancel_at_period_end', async () => {
    const { client, captures } = makeAdmin({ sub: MP_SUB })
    vi.mocked(createAdminClient).mockReturnValue(client)

    const res = await cancelActive(post())
    const body = await res.json()

    expect(body).toMatchObject({ ok: true, cancelled: true, id: 'sub-1' })
    const sub = writesTo(captures, 'app_subscriptions')[0]
    expect(sub.payload).toMatchObject({ status: 'cancelled', cancel_at_period_end: true })
    expect(sub.filters.id).toBe('sub-1')
  })

  it('Apple IAP → orienta os Ajustes do iOS, sem tocar no banco', async () => {
    const { client, captures } = makeAdmin({ sub: { ...MP_SUB, provider: 'apple' } })
    vi.mocked(createAdminClient).mockReturnValue(client)

    const body = await (await cancelActive(post())).json()

    expect(body).toMatchObject({ ok: true, cancelled: false, apple_iap: true })
    expect(captures.writes).toHaveLength(0)
  })
})

describe('cancel-active — período pago preservado e escopo por assinatura (A7.2/A7.3)', () => {
  it('entitlement com janela FINITA não é tocado — expira sozinho na data paga', async () => {
    const { client, captures } = makeAdmin({
      sub: MP_SUB,
      ents: [{ id: 'ent-1', valid_until: '2026-09-01T00:00:00Z', current_period_end: '2026-09-01T00:00:00Z' }],
    })
    vi.mocked(createAdminClient).mockReturnValue(client)

    await cancelActive(post())

    expect(writesTo(captures, 'user_entitlements')).toHaveLength(0)
  })

  it('entitlement SEM janela (valid_until NULL) ganha o fim do período — nunca acesso eterno pós-cancelamento', async () => {
    const { client, captures } = makeAdmin({
      sub: MP_SUB,
      ents: [{ id: 'ent-1', valid_until: null, current_period_end: '2026-09-01T00:00:00Z' }],
    })
    vi.mocked(createAdminClient).mockReturnValue(client)

    await cancelActive(post())

    const entWrites = writesTo(captures, 'user_entitlements')
    expect(entWrites).toHaveLength(1)
    expect(entWrites[0].payload.valid_until).toBe('2026-09-01T00:00:00Z')
    // Escopo: o alvo é o entitlement EXATO, nunca "todos do usuário".
    expect(entWrites[0].filters.id).toBe('ent-1')
    // E o status NÃO é rebaixado — o acesso vale até a data.
    expect('status' in entWrites[0].payload).toBe(false)
  })

  it('entitlement de OUTRO provedor jamais é tocado (cancelar MP não derruba VIP Apple)', async () => {
    const { client, captures } = makeAdmin({
      sub: MP_SUB,
      ents: [
        // O da assinatura cancelada (MP) — janela NULL, será fechado.
        { id: 'ent-mp', provider: 'mercadopago', provider_subscription_id: 'presub-1', valid_until: null, current_period_end: '2026-09-01T00:00:00Z' },
        // Um VIP Apple do MESMO usuário, também com janela NULL — era
        // exatamente ele que o revoke user-wide antigo derrubava junto.
        { id: 'ent-apple', provider: 'apple', provider_subscription_id: 'vip_elite1_month', valid_until: null, current_period_end: null },
      ],
    })
    vi.mocked(createAdminClient).mockReturnValue(client)

    await cancelActive(post())

    const entWrites = writesTo(captures, 'user_entitlements')
    expect(entWrites.some((w) => w.filters.id === 'ent-mp')).toBe(true)
    expect(entWrites.some((w) => w.filters.id === 'ent-apple')).toBe(false)
  })

  it('nenhuma escrita de entitlement revoga status nem zera valid_until de janela paga', async () => {
    const { client, captures } = makeAdmin({
      sub: MP_SUB,
      ents: [
        { id: 'ent-1', valid_until: '2026-09-01T00:00:00Z', current_period_end: '2026-09-01T00:00:00Z' },
        { id: 'ent-2', valid_until: null, current_period_end: null },
      ],
    })
    vi.mocked(createAdminClient).mockReturnValue(client)

    await cancelActive(post())

    for (const w of writesTo(captures, 'user_entitlements')) {
      expect(w.payload.status).toBeUndefined()
      expect(w.filters.id).toBeTruthy()
    }
  })
})

describe('cancel-pending — mesma regra de provedor-primeiro', () => {
  it('provedor falhou (assinatura pendente viva lá) → 502 e nenhuma escrita', async () => {
    const { client, captures } = makeAdmin({ sub: { ...MP_SUB, status: 'pending' } })
    vi.mocked(createAdminClient).mockReturnValue(client)
    vi.mocked(mercadopagoRequest).mockImplementation(async (opts) => {
      if (opts.method === 'PUT') throw new Error('mp fora do ar')
      return { status: 'pending' } as never
    })

    const res = await cancelPending(post())

    expect(res.status).toBe(502)
    expect(captures.writes).toHaveLength(0)
  })

  it('sucesso → marca a pendente como cancelada', async () => {
    const { client, captures } = makeAdmin({ sub: { ...MP_SUB, status: 'pending' } })
    vi.mocked(createAdminClient).mockReturnValue(client)

    const body = await (await cancelPending(post())).json()

    expect(body).toMatchObject({ ok: true, cancelled: true })
    expect(writesTo(captures, 'app_subscriptions')[0].payload.status).toBe('cancelled')
  })
})
