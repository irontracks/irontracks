/**
 * Guards do A8 (auditoria de cobranças 14/08/2026) — POST /api/student/charge.
 *
 * O defeito: o pagamento era criado no Mercado Pago ANTES da linha local, sem
 * X-Idempotency-Key estável (o helper gerava UUID aleatório). Consequências:
 * insert falhando deixava uma cobrança órfã que o aluno podia pagar sem o app
 * ter registro; e um retry após timeout abria um SEGUNDO PIX da mesma
 * mensalidade.
 *
 * Invariantes:
 *  1. A tentativa nasce no banco ANTES do provedor, e o id dela é a
 *     X-Idempotency-Key do POST.
 *  2. Falha no MP sem pagamento recuperável → tentativa marcada 'failed',
 *     resposta de erro — nunca cobrança sem linha local.
 *  3. Timeout com o pagamento JÁ criado no MP → a busca por external_reference
 *     recupera o pagamento pendente recente e NENHUM segundo POST acontece.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/utils/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/utils/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/mercadopago', () => ({
  mercadopagoRequest: vi.fn(),
  findRecentPendingPaymentByReference: vi.fn(async () => null),
}))
vi.mock('@/utils/rateLimit', () => ({
  checkRateLimitAsync: vi.fn(async () => ({ allowed: true })),
  getRequestIp: vi.fn(() => '203.0.113.12'),
}))
vi.mock('@/lib/logger', () => ({ logWarn: vi.fn(), logError: vi.fn(), logInfo: vi.fn() }))

import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { mercadopagoRequest, findRecentPendingPaymentByReference } from '@/lib/mercadopago'
import { POST } from '../charge/route'

const SUB_ID = '11111111-2222-3333-4444-555555555555'
const ATTEMPT_ID = 'charge-attempt-1'

type Op = { table: string; op: 'insert' | 'update'; payload: Record<string, unknown>; filters: Record<string, unknown> }
type Captures = { ops: Op[]; mpCalledAt: number[] }

function makeAdmin(cfg: { insertError?: { message: string } } = {}) {
  const captures: Captures = { ops: [], mpCalledAt: [] }
  const from = vi.fn((table: string) => {
    const chain: Record<string, unknown> = {}
    const self = () => chain
    chain.select = vi.fn(self)
    chain.eq = vi.fn(self)
    chain.order = vi.fn(self)
    chain.limit = vi.fn(self)
    chain.maybeSingle = vi.fn(async () => {
      if (table === 'student_subscriptions') {
        return {
          data: {
            id: SUB_ID,
            teacher_user_id: 'prof-1',
            plan_id: 'plan-uuid-1',
            status: 'pending',
            student_service_plans: { id: 'plan-uuid-1', name: 'Mensal', price_cents: 9990, duration_days: 30 },
          },
          error: null,
        }
      }
      // sem cobrança pendente prévia
      return { data: null, error: null }
    })
    chain.insert = vi.fn((payload: Record<string, unknown>) => {
      const op: Op = { table, op: 'insert', payload, filters: {} }
      captures.ops.push(op)
      return {
        select: vi.fn(() => ({
          single: vi.fn(async () =>
            cfg.insertError ? { data: null, error: cfg.insertError } : { data: { id: ATTEMPT_ID }, error: null }),
        })),
      }
    })
    chain.update = vi.fn((payload: Record<string, unknown>) => {
      const op: Op = { table, op: 'update', payload, filters: {} }
      captures.ops.push(op)
      const term: Record<string, unknown> = {}
      term.eq = vi.fn((col: string, val: unknown) => { op.filters[col] = val; return term })
      term.select = vi.fn(() => ({
        single: vi.fn(async () => ({ data: { id: ATTEMPT_ID, status: 'pending' }, error: null })),
      }))
      ;(term as unknown as PromiseLike<unknown>).then = ((resolve: (v: unknown) => unknown) =>
        resolve({ error: null })) as PromiseLike<unknown>['then']
      return term
    })
    return chain
  })
  return { client: { from } as unknown as ReturnType<typeof createAdminClient>, captures }
}

function makeAuthed() {
  return {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'aluno-1', email: 'a@x.com' } } })) },
  } as unknown as Awaited<ReturnType<typeof createClient>>
}

const post = () =>
  new Request('https://irontracks.com.br/api/student/charge', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ subscription_id: SUB_ID, cpfCnpj: '52998224725', mobilePhone: '41999998888' }),
  })

const MP_PAYMENT = {
  id: 987654,
  status: 'pending',
  point_of_interaction: { transaction_data: { qr_code_base64: 'QR64', qr_code: 'PIXCOPIA', ticket_url: 'https://mp/t' } },
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(createClient).mockResolvedValue(makeAuthed())
  vi.mocked(mercadopagoRequest).mockResolvedValue(MP_PAYMENT as never)
  vi.mocked(findRecentPendingPaymentByReference).mockResolvedValue(null)
})

describe('student/charge — a tentativa nasce antes do provedor (A8)', () => {
  it('insert local vem ANTES do POST no MP, e o id da tentativa é a X-Idempotency-Key', async () => {
    const { client, captures } = makeAdmin()
    vi.mocked(createAdminClient).mockReturnValue(client)
    let insertsBeforeMp = -1
    vi.mocked(mercadopagoRequest).mockImplementation(async (opts) => {
      if (opts.method === 'POST') {
        insertsBeforeMp = captures.ops.filter((o) => o.table === 'student_charges' && o.op === 'insert').length
      }
      return MP_PAYMENT as never
    })

    const res = await POST(post())
    const body = await res.json()

    expect(body.ok).toBe(true)
    // A linha local já existia quando o provedor foi chamado.
    expect(insertsBeforeMp).toBe(1)
    const mpPost = vi.mocked(mercadopagoRequest).mock.calls.find(([o]) => o.method === 'POST')
    expect(mpPost![0].idempotencyKey).toBe(ATTEMPT_ID)
    // E a tentativa é completada por UPDATE (payment id + pix), não por um novo insert.
    const upd = captures.ops.find((o) => o.op === 'update' && o.table === 'student_charges')
    expect(upd?.filters.id).toBe(ATTEMPT_ID)
    expect(upd?.payload.provider_payment_id).toBe('987654')
  })

  it('falha do MP sem pagamento recuperável → tentativa vira failed e resposta é 502', async () => {
    const { client, captures } = makeAdmin()
    vi.mocked(createAdminClient).mockReturnValue(client)
    vi.mocked(mercadopagoRequest).mockRejectedValue(new Error('mp timeout'))

    const res = await POST(post())

    expect(res.status).toBe(502)
    const failed = captures.ops.find((o) => o.op === 'update' && o.payload.status === 'failed')
    expect(failed?.filters.id).toBe(ATTEMPT_ID)
  })

  it('timeout com pagamento JÁ criado no MP → recupera pelo external_reference, sem segundo POST', async () => {
    const { client, captures } = makeAdmin()
    vi.mocked(createAdminClient).mockReturnValue(client)
    vi.mocked(mercadopagoRequest).mockRejectedValue(new Error('socket hang up'))
    vi.mocked(findRecentPendingPaymentByReference).mockResolvedValue(MP_PAYMENT as never)

    const res = await POST(post())
    const body = await res.json()

    expect(body.ok).toBe(true)
    // O pagamento recuperado completa a MESMA tentativa.
    const upd = captures.ops.find((o) => o.op === 'update' && o.payload.provider_payment_id === '987654')
    expect(upd?.filters.id).toBe(ATTEMPT_ID)
    // E só houve UM POST de criação no MP.
    expect(vi.mocked(mercadopagoRequest).mock.calls.filter(([o]) => o.method === 'POST')).toHaveLength(1)
  })

  it('falha no INSERT da tentativa → erro ANTES de qualquer chamada ao provedor (nunca cobrança órfã)', async () => {
    const { client } = makeAdmin({ insertError: { message: 'db down' } })
    vi.mocked(createAdminClient).mockReturnValue(client)

    const res = await POST(post())
    const body = await res.json()

    // respondDbError responde 4xx/5xx — o que importa: é ERRO e o provedor
    // nunca foi chamado (a cobrança órfã era exatamente o MP sem linha local).
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(body.ok).toBe(false)
    expect(vi.mocked(mercadopagoRequest)).not.toHaveBeenCalled()
  })
})
