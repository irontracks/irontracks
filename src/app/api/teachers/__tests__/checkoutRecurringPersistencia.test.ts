/**
 * Guards do C1 (auditoria de cobranças 14/08/2026): a assinatura recorrente de
 * professor NUNCA persistia — plan_id levava a chave do tier ('pro'), que não
 * existe em app_plans (FK) e a coluna era NOT NULL: 23503 em todo insert, erro
 * devolvido em { error } (o supabase-js não lança, o catch não rodava) e a rota
 * respondia ok:true com o link do Mercado Pago. Produção: ZERO linhas.
 *
 * Invariantes:
 *  1. O insert grava plan_id NULL + tier em metadata.tier_key (é de onde o
 *     webhook de preapproval lê) — nunca a chave do tier na coluna com FK.
 *  2. Falha na persistência → a preapproval é CANCELADA no MP (compensação) e
 *     a resposta é ERRO. Entregar link de pagamento sem linha local é cobrança
 *     órfã: o professor paga e o webhook não encontra o que reconciliar.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/utils/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/utils/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/mercadopago', () => ({ mercadopagoRequest: vi.fn() }))
vi.mock('@/utils/rateLimit', () => ({
  checkRateLimitAsync: vi.fn(async () => ({ allowed: true })),
  getRequestIp: vi.fn(() => '203.0.113.10'),
}))
vi.mock('@/lib/logger', () => ({ logWarn: vi.fn(), logError: vi.fn(), logInfo: vi.fn() }))

import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { mercadopagoRequest } from '@/lib/mercadopago'
import { POST } from '../checkout-recurring/route'

const PREAPPROVAL_ID = 'presub-99'

type Captures = { subInserts: Array<Record<string, unknown>> }

function makeAdmin(opts: { insertError?: { message?: string; code?: string } } = {}) {
  const captures: Captures = { subInserts: [] }
  const from = vi.fn((table: string) => {
    const chain: Record<string, unknown> = {}
    const self = () => chain
    chain.select = vi.fn(self)
    chain.eq = vi.fn(self)
    chain.filter = vi.fn(self)
    chain.in = vi.fn(self)
    chain.order = vi.fn(self)
    chain.limit = vi.fn(self)
    chain.maybeSingle = vi.fn(async () => {
      if (table === 'teacher_tiers') {
        return { data: { tier_key: 'pro', name: 'Pro', price_cents: 9990, currency: 'BRL', max_students: 50 }, error: null }
      }
      if (table === 'teachers') return { data: { id: 'teacher-1' }, error: null }
      return { data: null, error: null }
    })
    chain.insert = vi.fn(async (payload: Record<string, unknown>) => {
      if (table === 'app_subscriptions') {
        captures.subInserts.push(payload)
        return { error: opts.insertError ?? null }
      }
      return { error: null }
    })
    chain.update = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }))
    // A varredura de preapprovals antigas é awaited direto (sem maybeSingle).
    ;(chain as unknown as PromiseLike<unknown>).then = ((resolve: (v: unknown) => unknown) =>
      resolve({ data: [], error: null })) as PromiseLike<unknown>['then']
    return chain
  })
  const client = {
    from,
    rpc: vi.fn(async () => ({ data: 0, error: null })),
  } as unknown as ReturnType<typeof createAdminClient>
  return { client, captures }
}

function makeAuthed() {
  return {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-prof', email: 'prof@x.com' } } })) },
  } as unknown as Awaited<ReturnType<typeof createClient>>
}

const post = () =>
  new Request('https://irontracks.com.br/api/teachers/checkout-recurring', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ planId: 'pro' }),
  })

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(createClient).mockResolvedValue(makeAuthed())
  vi.mocked(mercadopagoRequest).mockResolvedValue({ id: PREAPPROVAL_ID, init_point: 'https://mp.example/init' } as never)
})

describe('checkout-recurring do professor — persistência (C1)', () => {
  it('grava plan_id NULL e o tier em metadata.tier_key', async () => {
    const { client, captures } = makeAdmin()
    vi.mocked(createAdminClient).mockReturnValue(client)

    const res = await POST(post())
    const body = await res.json()

    expect(body).toMatchObject({ ok: true, subscription_id: PREAPPROVAL_ID })
    expect(captures.subInserts).toHaveLength(1)
    const row = captures.subInserts[0]
    // A chave do tier NÃO pode ir na coluna com FK para app_plans — é
    // exatamente o 23503 que deixou produção com zero assinaturas.
    expect(row.plan_id).toBeNull()
    expect(row.provider_subscription_id).toBe(PREAPPROVAL_ID)
    expect((row.metadata as Record<string, unknown>).scope).toBe('teacher_plan_recurring')
    expect((row.metadata as Record<string, unknown>).tier_key).toBe('pro')
  })

  it('falha na persistência → cancela a preapproval no MP e responde ERRO (nunca ok com link)', async () => {
    const { client } = makeAdmin({ insertError: { message: 'boom', code: '23503' } })
    vi.mocked(createAdminClient).mockReturnValue(client)

    const res = await POST(post())
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body.ok).toBe(false)
    // Compensação: a preapproval recém-criada é cancelada no provedor — sem
    // isso o professor seguiria com um checkout válido que nunca vira plano.
    const cancelCall = vi.mocked(mercadopagoRequest).mock.calls.find(
      ([opts]) => opts.method === 'PUT' && String(opts.path).includes(PREAPPROVAL_ID),
    )
    expect(cancelCall).toBeTruthy()
    expect((cancelCall![0].body as Record<string, unknown>).status).toBe('cancelled')
  })
})
