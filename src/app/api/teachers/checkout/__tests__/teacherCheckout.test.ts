/**
 * Testes do checkout de plano do professor (POST /api/teachers/checkout).
 *
 * Contexto: rota sem nenhum teste até o mapa de cobertura (2026-07-28). É onde
 * o professor gera a cobrança PIX do próprio plano.
 *
 * Invariantes travados:
 *  1. Sem sessão → 401. O cobrado é sempre o usuário autenticado, nunca um id
 *     vindo do corpo da requisição.
 *  2. O VALOR vem do banco (`teacher_tiers.price_cents`), jamais do cliente —
 *     mandar `price_cents`/`amount` no corpo não muda o que é cobrado.
 *  3. Plano inexistente/inativo → 404; plano gratuito → 400.
 *  4. Downgrade que deixaria alunos além do limite → 409, sem cobrar.
 *  5. Rate limit → 429.
 *  6. A `external_reference` sai no formato que o webhook entende — é ela que
 *     transforma "pagamento aprovado" em "plano ativo".
 *  7. Falha do Mercado Pago → 502, sem fatura pendente inventada.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

vi.mock('@/utils/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/utils/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/mercadopago', () => ({ mercadopagoRequest: vi.fn() }))
vi.mock('@/utils/rateLimit', () => ({
  checkRateLimitAsync: vi.fn(async () => ({ allowed: true })),
  getRequestIp: vi.fn(() => '203.0.113.5'),
}))
vi.mock('@/lib/logger', () => ({ logError: vi.fn(), logWarn: vi.fn(), logInfo: vi.fn() }))

import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { mercadopagoRequest } from '@/lib/mercadopago'
import { checkRateLimitAsync } from '@/utils/rateLimit'
import { parseExternalReference } from '@/utils/billing/mercadopagoWebhookRules'
import { POST } from '../route'

const USER = { id: 'user-prof-1', email: 'prof@irontracks.com.br' }

function mockAuth(user: unknown = USER) {
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: vi.fn(async () => ({ data: { user } })) },
  } as unknown as Awaited<ReturnType<typeof createClient>>)
}

type Captures = { writes: Array<{ table: string; op: string; payload: Record<string, unknown> }> }

function makeAdmin(opts: {
  tier?: Record<string, unknown> | null
  teacher?: Record<string, unknown> | null
  studentCount?: number
} = {}) {
  const captures: Captures = { writes: [] }
  const tier = opts.tier === undefined
    ? { tier_key: 'pro', name: 'Pro', price_cents: 9990, currency: 'BRL', max_students: 30 }
    : opts.tier
  const teacher = opts.teacher === undefined ? { id: 'teacher-1', plan_id: null } : opts.teacher

  const from = vi.fn((table: string) => {
    const chain: Record<string, unknown> = {}
    const self = () => chain
    chain.select = vi.fn(self)
    chain.eq = vi.fn(self)
    chain.maybeSingle = vi.fn(async () => {
      if (table === 'teacher_tiers') return { data: tier, error: null }
      if (table === 'teachers') return { data: teacher, error: null }
      return { data: null, error: null }
    })
    chain.upsert = vi.fn(async (payload: Record<string, unknown>) => {
      captures.writes.push({ table, op: 'upsert', payload })
      return { error: null }
    })
    chain.update = vi.fn((payload: Record<string, unknown>) => {
      captures.writes.push({ table, op: 'update', payload })
      const term: Record<string, unknown> = {}
      term.eq = vi.fn(async () => ({ error: null }))
      return term
    })
    return chain
  })

  const rpc = vi.fn(async () => ({ data: opts.studentCount ?? 0, error: null }))

  return { client: { from, rpc } as unknown as ReturnType<typeof createAdminClient>, captures }
}

const mpPayment = {
  id: 'mp-payment-1',
  point_of_interaction: { transaction_data: { qr_code_base64: 'QRBASE64', qr_code: 'pix-copia-e-cola', ticket_url: 'https://mp/ticket' } },
  date_of_expiration: '2026-08-01T12:00:00.000Z',
}

const post = (body: unknown) =>
  new Request('https://irontracks.com.br/api/teachers/checkout', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://irontracks.com.br' },
    body: JSON.stringify(body),
  })

const validBody = { planId: 'pro', cpfCnpj: '12345678909', mobilePhone: '41999999999', name: 'Prof Teste' }

describe('teachers/checkout — acesso', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('sem sessão → 401 e nenhuma cobrança criada', async () => {
    mockAuth(null)
    const { client } = makeAdmin()
    vi.mocked(createAdminClient).mockReturnValue(client)

    const res = await POST(post(validBody))

    expect(res.status).toBe(401)
    expect(mercadopagoRequest).not.toHaveBeenCalled()
  })

  it('rate limit → 429 antes de falar com o gateway', async () => {
    mockAuth()
    const { client } = makeAdmin()
    vi.mocked(createAdminClient).mockReturnValue(client)
    vi.mocked(checkRateLimitAsync).mockResolvedValueOnce({ allowed: false } as Awaited<ReturnType<typeof checkRateLimitAsync>>)

    const res = await POST(post(validBody))

    expect(res.status).toBe(429)
    expect(mercadopagoRequest).not.toHaveBeenCalled()
  })

  it('CPF inválido é recusado antes de cobrar', async () => {
    mockAuth()
    const { client } = makeAdmin()
    vi.mocked(createAdminClient).mockReturnValue(client)

    const res = await POST(post({ ...validBody, cpfCnpj: '123' }))

    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(mercadopagoRequest).not.toHaveBeenCalled()
  })
})

describe('teachers/checkout — o valor vem do banco', () => {
  beforeEach(() => { vi.clearAllMocks(); mockAuth() })

  it('cobra o preço do tier, ignorando valor enviado pelo cliente', async () => {
    const { client } = makeAdmin({ tier: { tier_key: 'pro', name: 'Pro', price_cents: 9990, currency: 'BRL', max_students: 30 } })
    vi.mocked(createAdminClient).mockReturnValue(client)
    vi.mocked(mercadopagoRequest).mockResolvedValue(mpPayment)

    // O cliente tenta pagar 1 centavo por um plano de R$ 99,90.
    await POST(post({ ...validBody, price_cents: 1, amount: 0.01, transaction_amount: 0.01 }))

    const body = vi.mocked(mercadopagoRequest).mock.calls[0][0].body as Record<string, unknown>
    expect(body.transaction_amount).toBe(99.9)
  })

  // O teste acima passa mesmo com o handler adulterado, porque o `.strip()` do
  // schema descarta `amount` antes de qualquer leitura — a proteção real está
  // no schema, então é ele que precisa estar travado. Trocar `.strip()` por
  // `.passthrough()` reabriria a porta sem nenhum teste comportamental notar.
  it('o schema descarta campos de valor enviados pelo cliente', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'src/app/api/teachers/checkout/route.ts'), 'utf-8')
    expect(src).toMatch(/\}\)\.strip\(\)/)
    expect(src).not.toContain('.passthrough()')
    // Nenhum campo de preço no contrato de entrada.
    const schema = src.slice(src.indexOf('const BodySchema'), src.indexOf('export async function POST'))
    expect(schema).not.toMatch(/price|amount|valor|cents/i)
  })

  it('o valor cobrado é derivado de plan.price_cents', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'src/app/api/teachers/checkout/route.ts'), 'utf-8')
    expect(src).toMatch(/const amount = Number\(\(plan\.price_cents \?\? 0\) \/ 100\)/)
  })

  it('plano inexistente ou inativo → 404', async () => {
    const { client } = makeAdmin({ tier: null })
    vi.mocked(createAdminClient).mockReturnValue(client)

    const res = await POST(post(validBody))

    expect(res.status).toBe(404)
    expect(mercadopagoRequest).not.toHaveBeenCalled()
  })

  it('plano gratuito não gera cobrança → 400', async () => {
    const { client } = makeAdmin({ tier: { tier_key: 'free', name: 'Free', price_cents: 0, currency: 'BRL', max_students: 2 } })
    vi.mocked(createAdminClient).mockReturnValue(client)

    const res = await POST(post({ ...validBody, planId: 'free' }))

    expect(res.status).toBe(400)
    expect(mercadopagoRequest).not.toHaveBeenCalled()
  })

  it('professor inexistente → 404', async () => {
    const { client } = makeAdmin({ teacher: null })
    vi.mocked(createAdminClient).mockReturnValue(client)

    expect((await POST(post(validBody))).status).toBe(404)
  })
})

describe('teachers/checkout — downgrade', () => {
  beforeEach(() => { vi.clearAllMocks(); mockAuth() })

  it('bloqueia downgrade que deixaria alunos além do limite → 409', async () => {
    const { client } = makeAdmin({
      tier: { tier_key: 'basic', name: 'Basic', price_cents: 4990, currency: 'BRL', max_students: 10 },
      studentCount: 25,
    })
    vi.mocked(createAdminClient).mockReturnValue(client)

    const res = await POST(post({ ...validBody, planId: 'basic' }))

    expect(res.status).toBe(409)
    expect(mercadopagoRequest).not.toHaveBeenCalled()
  })

  it('permite quando cabe no limite', async () => {
    const { client } = makeAdmin({
      tier: { tier_key: 'basic', name: 'Basic', price_cents: 4990, currency: 'BRL', max_students: 10 },
      studentCount: 4,
    })
    vi.mocked(createAdminClient).mockReturnValue(client)
    vi.mocked(mercadopagoRequest).mockResolvedValue(mpPayment)

    expect((await POST(post({ ...validBody, planId: 'basic' }))).status).toBe(200)
  })
})

describe('teachers/checkout — o elo com o webhook', () => {
  beforeEach(() => { vi.clearAllMocks(); mockAuth() })

  it('a external_reference é legível pelo webhook e aponta pro professor logado', async () => {
    const { client } = makeAdmin()
    vi.mocked(createAdminClient).mockReturnValue(client)
    vi.mocked(mercadopagoRequest).mockResolvedValue(mpPayment)

    await POST(post(validBody))

    const body = vi.mocked(mercadopagoRequest).mock.calls[0][0].body as Record<string, unknown>
    const parsed = parseExternalReference(body.external_reference)
    expect(parsed).toEqual({ scope: 'teacher_plan', userId: USER.id, tierKey: 'pro' })
  })

  it('registra a fatura pendente com o valor do banco', async () => {
    const { client, captures } = makeAdmin()
    vi.mocked(createAdminClient).mockReturnValue(client)
    vi.mocked(mercadopagoRequest).mockResolvedValue(mpPayment)

    await POST(post(validBody))

    const invoice = captures.writes.find((w) => w.table === 'app_payments')
    expect(invoice?.payload).toMatchObject({
      user_id: USER.id,
      amount_cents: 9990,
      status: 'pending',
      provider: 'mercadopago',
      provider_payment_id: 'mp-payment-1',
    })
  })

  it('devolve o PIX pro app', async () => {
    const { client } = makeAdmin()
    vi.mocked(createAdminClient).mockReturnValue(client)
    vi.mocked(mercadopagoRequest).mockResolvedValue(mpPayment)

    const body = await (await POST(post(validBody))).json()

    expect(body).toMatchObject({
      ok: true,
      payment_id: 'mp-payment-1',
      pix_payload: 'pix-copia-e-cola',
      amount: 99.9,
    })
  })

  it('falha do gateway → 502 e nenhuma fatura registrada', async () => {
    const { client, captures } = makeAdmin()
    vi.mocked(createAdminClient).mockReturnValue(client)
    vi.mocked(mercadopagoRequest).mockRejectedValue(new Error('MP fora do ar'))

    const res = await POST(post(validBody))

    expect(res.status).toBe(502)
    expect(captures.writes.filter((w) => w.table === 'app_payments')).toHaveLength(0)
  })
})
