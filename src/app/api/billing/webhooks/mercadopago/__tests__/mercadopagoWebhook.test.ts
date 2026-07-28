/**
 * Testes do handler do webhook do Mercado Pago
 * (POST /api/billing/webhooks/mercadopago).
 *
 * As regras puras (assinatura, anti-replay, valor pago, mapeamento de status)
 * são exercitadas em `src/utils/billing/__tests__/mercadopagoWebhookRules.test.ts`.
 * Aqui travamos o que só o handler decide: quem entra, quem é barrado, e o que
 * é gravado em cada cenário de dinheiro.
 *
 * Invariantes travados:
 *  1. Sem segredo configurado → 500 fail-closed.
 *  2. Faltando assinatura / request-id / data.id → 400, sem tocar o banco.
 *  3. Assinatura inválida → 401, sem tocar o banco.
 *  4. VIP aprovado → entitlement ativo + assinatura ativa.
 *  5. Estorno/chargeback → entitlement revogado e assinatura cancelada.
 *  6. Valor pago abaixo da metade do plano → grant BLOQUEADO (`amount_mismatch`),
 *     sem entitlement.
 *  7. teacher_plan aprovado → linha de professor ativa; estornado → volta pra free.
 *  8. Evento de tipo desconhecido → 200 `ignored`, sem escrita de acesso.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import crypto from 'crypto'

const SECRET = 'mp-webhook-secret'
vi.hoisted(() => {
  process.env.MERCADOPAGO_WEBHOOK_SECRET = 'mp-webhook-secret'
})

vi.mock('@/utils/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/mercadopago', () => ({ mercadopagoRequest: vi.fn() }))
vi.mock('@/utils/cache', () => ({ cacheDelete: vi.fn(async () => {}) }))
vi.mock('@/lib/logger', () => ({ logWarn: vi.fn(), logError: vi.fn(), logInfo: vi.fn() }))

import { createAdminClient } from '@/utils/supabase/admin'
import { mercadopagoRequest } from '@/lib/mercadopago'
import { POST } from '../route'

const DATA_ID = 'pay-1'
const REQ_ID = 'req-1'

function sign(dataId = DATA_ID, requestId = REQ_ID, atMs = Date.now()) {
  const ts = Math.floor(atMs / 1000)
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`
  const v1 = crypto.createHmac('sha256', SECRET).update(manifest).digest('hex')
  return `ts=${ts},v1=${v1}`
}

type Captures = {
  writes: Array<{ table: string; op: 'update' | 'upsert' | 'insert'; payload: Record<string, unknown> }>
}

function makeAdmin(rows: Record<string, unknown> = {}) {
  const captures: Captures = { writes: [] }

  const from = vi.fn((table: string) => {
    const chain: Record<string, unknown> = {}
    const self = () => chain

    chain.select = vi.fn(self)
    chain.eq = vi.fn(self)
    chain.in = vi.fn(self)
    chain.order = vi.fn(self)
    chain.limit = vi.fn(self)
    chain.maybeSingle = vi.fn(async () => ({ data: (rows[table] as Record<string, unknown>) ?? null, error: null }))
    chain.single = vi.fn(async () => ({ data: (rows[table] as Record<string, unknown>) ?? null, error: null }))

    chain.insert = vi.fn(async (payload: Record<string, unknown>) => {
      captures.writes.push({ table, op: 'insert', payload })
      return { error: null }
    })
    chain.upsert = vi.fn(async (payload: Record<string, unknown>) => {
      captures.writes.push({ table, op: 'upsert', payload })
      return { error: null }
    })
    chain.update = vi.fn((payload: Record<string, unknown>) => {
      captures.writes.push({ table, op: 'update', payload })
      const term: Record<string, unknown> = {}
      term.eq = vi.fn(() => term)
      term.in = vi.fn(() => term)
      term.select = vi.fn(() => term)
      term.maybeSingle = vi.fn(async () => ({ data: null, error: null }))
      ;(term as unknown as PromiseLike<unknown>).then = ((resolve: (v: unknown) => unknown) =>
        resolve({ error: null })) as PromiseLike<unknown>['then']
      return term
    })

    return chain
  })

  return { client: { from } as unknown as ReturnType<typeof createAdminClient>, captures }
}

function post(body: unknown, opts: { signature?: string; requestId?: string } = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (opts.signature !== undefined) { if (opts.signature) headers['x-signature'] = opts.signature }
  else headers['x-signature'] = sign()
  if (opts.requestId !== undefined) { if (opts.requestId) headers['x-request-id'] = opts.requestId }
  else headers['x-request-id'] = REQ_ID

  return new Request('https://irontracks.com.br/api/billing/webhooks/mercadopago', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

const paymentEvent = { type: 'payment', data: { id: DATA_ID } }

/** Payload que a API do MP devolveria para o pagamento consultado. */
const mpPayment = (over: Record<string, unknown> = {}) => ({
  id: DATA_ID,
  status: 'approved',
  transaction_amount: 99.9,
  currency_id: 'BRL',
  external_reference: 'vip:user-1:plan-1',
  ...over,
})

const writesTo = (c: Captures, table: string) => c.writes.filter((w) => w.table === table)

describe('webhook MP — porta de entrada', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('segredo não configurado → 500 fail-closed', async () => {
    const { client, captures } = makeAdmin()
    vi.mocked(createAdminClient).mockReturnValue(client)
    vi.stubEnv('MERCADOPAGO_WEBHOOK_SECRET', '')

    const res = await POST(post(paymentEvent))

    expect(res.status).toBe(500)
    expect(captures.writes).toHaveLength(0)
    vi.unstubAllEnvs()
  })

  it('sem assinatura → 400 e nenhuma escrita', async () => {
    const { client, captures } = makeAdmin()
    vi.mocked(createAdminClient).mockReturnValue(client)

    const res = await POST(post(paymentEvent, { signature: '' }))

    expect(res.status).toBe(400)
    expect(captures.writes).toHaveLength(0)
  })

  it('sem x-request-id → 400', async () => {
    const { client } = makeAdmin()
    vi.mocked(createAdminClient).mockReturnValue(client)

    expect((await POST(post(paymentEvent, { requestId: '' }))).status).toBe(400)
  })

  it('sem data.id → 400', async () => {
    const { client } = makeAdmin()
    vi.mocked(createAdminClient).mockReturnValue(client)

    expect((await POST(post({ type: 'payment' }))).status).toBe(400)
  })

  it('assinatura inválida → 401 e nenhuma escrita', async () => {
    const { client, captures } = makeAdmin()
    vi.mocked(createAdminClient).mockReturnValue(client)

    const res = await POST(post(paymentEvent, { signature: 'ts=123,v1=deadbeef' }))

    expect(res.status).toBe(401)
    expect(captures.writes).toHaveLength(0)
    expect(mercadopagoRequest).not.toHaveBeenCalled()
  })

  it('evento de tipo desconhecido é ignorado sem conceder nada', async () => {
    const { client, captures } = makeAdmin()
    vi.mocked(createAdminClient).mockReturnValue(client)

    const res = await POST(post({ type: 'plugin_feito_pelo_mp', data: { id: DATA_ID } }))
    const body = await res.json()

    expect(body).toMatchObject({ ok: true, ignored: true })
    expect(writesTo(captures, 'user_entitlements')).toHaveLength(0)
  })
})

describe('webhook MP — VIP por pagamento', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('pagamento aprovado concede entitlement ativo', async () => {
    const { client, captures } = makeAdmin({
      app_plans: { id: 'plan-1', interval: 'month', price_cents: 9990, currency: 'BRL' },
      app_subscriptions: { id: 'sub-1', status: 'pending' },
    })
    vi.mocked(createAdminClient).mockReturnValue(client)
    vi.mocked(mercadopagoRequest).mockResolvedValue(mpPayment())

    const res = await POST(post(paymentEvent))

    expect(res.status).toBe(200)
    const ents = writesTo(captures, 'user_entitlements')
    expect(ents).toHaveLength(1)
    expect(ents[0].payload).toMatchObject({
      user_id: 'user-1',
      status: 'active',
      provider: 'mercadopago',
    })
    expect(ents[0].payload.valid_until).toBeTruthy()
  })

  it('pagamento pendente NÃO concede entitlement', async () => {
    const { client, captures } = makeAdmin({
      app_plans: { id: 'plan-1', interval: 'month', price_cents: 9990, currency: 'BRL' },
    })
    vi.mocked(createAdminClient).mockReturnValue(client)
    vi.mocked(mercadopagoRequest).mockResolvedValue(mpPayment({ status: 'pending' }))

    await POST(post(paymentEvent))

    expect(writesTo(captures, 'user_entitlements')).toHaveLength(0)
  })

  it('valor abaixo da metade do plano BLOQUEIA o acesso', async () => {
    const { client, captures } = makeAdmin({
      app_plans: { id: 'plan-1', interval: 'month', price_cents: 9990, currency: 'BRL' },
    })
    vi.mocked(createAdminClient).mockReturnValue(client)
    vi.mocked(mercadopagoRequest).mockResolvedValue(mpPayment({ transaction_amount: 10 }))

    const body = await (await POST(post(paymentEvent))).json()

    expect(body).toMatchObject({ ok: true, skipped: 'amount_mismatch' })
    expect(writesTo(captures, 'user_entitlements')).toHaveLength(0)
  })

  it('moeda divergente BLOQUEIA o acesso', async () => {
    const { client, captures } = makeAdmin({
      app_plans: { id: 'plan-1', interval: 'month', price_cents: 9990, currency: 'BRL' },
    })
    vi.mocked(createAdminClient).mockReturnValue(client)
    vi.mocked(mercadopagoRequest).mockResolvedValue(mpPayment({ currency_id: 'ARS' }))

    const body = await (await POST(post(paymentEvent))).json()

    expect(body).toMatchObject({ skipped: 'amount_mismatch' })
    expect(writesTo(captures, 'user_entitlements')).toHaveLength(0)
  })

  it.each(['refunded', 'charged_back', 'cancelled'])('%s revoga entitlement e cancela assinatura', async (status) => {
    const { client, captures } = makeAdmin({
      app_plans: { id: 'plan-1', interval: 'month', price_cents: 9990, currency: 'BRL' },
    })
    vi.mocked(createAdminClient).mockReturnValue(client)
    vi.mocked(mercadopagoRequest).mockResolvedValue(mpPayment({ status }))

    await POST(post(paymentEvent))

    const ent = writesTo(captures, 'user_entitlements').find((w) => w.op === 'update')
    expect(ent?.payload).toMatchObject({ status: 'revoked' })
    const sub = writesTo(captures, 'app_subscriptions').find((w) => w.payload.status === 'cancelled')
    expect(sub).toBeTruthy()
  })
})

describe('webhook MP — plano do professor', () => {
  beforeEach(() => { vi.clearAllMocks() })

  const teacherEventPayment = (over: Record<string, unknown> = {}) =>
    mpPayment({ external_reference: 'teacher_plan:user-prof:pro', ...over })

  it('aprovado ativa o plano do professor com validade de 1 mês', async () => {
    const { client, captures } = makeAdmin({
      teacher_tiers: { price_cents: 9990, currency: 'BRL' },
    })
    vi.mocked(createAdminClient).mockReturnValue(client)
    vi.mocked(mercadopagoRequest).mockResolvedValue(teacherEventPayment())

    await POST(post(paymentEvent))

    const t = writesTo(captures, 'teachers').find((w) => w.op === 'update')
    expect(t?.payload).toMatchObject({ plan_tier_key: 'pro', plan_status: 'active' })
    expect(t?.payload.plan_valid_until).toBeTruthy()
  })

  it('estorno devolve o professor para o free', async () => {
    const { client, captures } = makeAdmin({ teacher_tiers: { price_cents: 9990, currency: 'BRL' } })
    vi.mocked(createAdminClient).mockReturnValue(client)
    vi.mocked(mercadopagoRequest).mockResolvedValue(teacherEventPayment({ status: 'refunded' }))

    await POST(post(paymentEvent))

    const t = writesTo(captures, 'teachers').find((w) => w.payload.plan_status === 'cancelled')
    expect(t?.payload).toMatchObject({ plan_tier_key: 'free', plan_valid_until: null })
  })

  it('valor muito abaixo do tier BLOQUEIA a ativação do plano', async () => {
    const { client, captures } = makeAdmin({ teacher_tiers: { price_cents: 9990, currency: 'BRL' } })
    vi.mocked(createAdminClient).mockReturnValue(client)
    vi.mocked(mercadopagoRequest).mockResolvedValue(teacherEventPayment({ transaction_amount: 5 }))

    const body = await (await POST(post(paymentEvent))).json()

    expect(body).toMatchObject({ skipped: 'amount_mismatch' })
    expect(writesTo(captures, 'teachers')).toHaveLength(0)
  })
})
