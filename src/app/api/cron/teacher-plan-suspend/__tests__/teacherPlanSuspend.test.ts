/**
 * Testes do cron que SUSPENDE plano pago de professor
 * (GET /api/cron/teacher-plan-suspend).
 *
 * Contexto: o mapa de cobertura (2026-07-28) marcou este handler como sem
 * nenhum teste. Ele roda diariamente sozinho e rebaixa professores pagantes
 * para o tier free (máx. 2 alunos). Um erro aqui não aparece em tela de
 * ninguém — o professor só descobre quando não consegue mais atender aluno.
 *
 * Invariantes travados:
 *  1. Sem autorização de cron → 403 e NENHUMA escrita.
 *  2. Só suspende quem passou do período de carência (3 dias). Vencido ontem
 *     continua ativo — é a carência que dá tempo do PIX cair.
 *  3. Só mexe em plano PAGO e ATIVO (`plan_status = 'active'`, tier ≠ free).
 *  4. Nada a suspender → nenhum UPDATE e nenhuma notificação (idempotente e
 *     silencioso; um push de "plano suspenso" indevido é dano real).
 *  5. Suspender = plan_status 'cancelled' + notificação billing_issue para cada
 *     professor atingido. Nunca apaga dados — pagar de novo restaura.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const CRON_SECRET = 'test-cron-secret'
vi.hoisted(() => {
  process.env.CRON_SECRET = 'test-cron-secret'
})

vi.mock('@/utils/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/social/notifyFollowers', () => ({ insertNotifications: vi.fn(async () => {}) }))
vi.mock('@/lib/logger', () => ({ logInfo: vi.fn(), logWarn: vi.fn(), logError: vi.fn() }))

import { createAdminClient } from '@/utils/supabase/admin'
import { insertNotifications } from '@/lib/social/notifyFollowers'
import { GET } from '../route'

type TeacherRow = {
  id: string
  user_id: string | null
  plan_tier_key: string
  plan_valid_until: string | null
}

type Captures = {
  update: Record<string, unknown> | null
  updatedIds: string[] | null
  filters: Record<string, unknown>
  cutoff: string | null
}

/**
 * Mock encadeável do admin client. Aplica os mesmos filtros que a query real
 * pede (`eq`/`neq`/`lt`) sobre as linhas fornecidas — assim o teste exercita a
 * regra de carência de verdade, em vez de confiar num array pré-filtrado.
 */
function makeAdmin(rows: TeacherRow[], opts: { selectError?: unknown; updateError?: unknown } = {}) {
  const captures: Captures = { update: null, updatedIds: null, filters: {}, cutoff: null }

  const from = vi.fn(() => {
    let working = [...rows]
    const chain: Record<string, unknown> = {}

    chain.select = vi.fn(() => chain)
    chain.eq = vi.fn((col: string, val: unknown) => {
      captures.filters[`eq:${col}`] = val
      working = working.filter((r) => (r as unknown as Record<string, unknown>)[col] === val)
      return chain
    })
    chain.neq = vi.fn((col: string, val: unknown) => {
      captures.filters[`neq:${col}`] = val
      working = working.filter((r) => (r as unknown as Record<string, unknown>)[col] !== val)
      return chain
    })
    chain.not = vi.fn((col: string, _op: string, _val: unknown) => {
      working = working.filter((r) => (r as unknown as Record<string, unknown>)[col] != null)
      return chain
    })
    chain.lt = vi.fn((col: string, val: string) => {
      captures.cutoff = val
      working = working.filter((r) => {
        const cur = (r as unknown as Record<string, unknown>)[col]
        return typeof cur === 'string' && cur < val
      })
      return chain
    })
    chain.limit = vi.fn(async () => {
      if (opts.selectError) return { data: null, error: opts.selectError }
      return { data: working, error: null }
    })
    chain.update = vi.fn((payload: Record<string, unknown>) => {
      captures.update = payload
      return {
        in: vi.fn(async (_col: string, ids: string[]) => {
          captures.updatedIds = ids
          return { error: opts.updateError ?? null }
        }),
      }
    })

    return chain
  })

  return { client: { from } as unknown as ReturnType<typeof createAdminClient>, captures }
}

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString()

const req = (secret?: string) =>
  new Request('https://irontracks.com.br/api/cron/teacher-plan-suspend', {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  })

// Plano pago e ativo, vencido há `days` dias.
const teacher = (id: string, days: number, over: Partial<TeacherRow> = {}): TeacherRow & Record<string, unknown> => ({
  id,
  user_id: `user-${id}`,
  plan_tier_key: 'pro',
  plan_valid_until: daysAgo(days),
  plan_status: 'active',
  ...over,
})

describe('cron teacher-plan-suspend', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('sem Bearer → 403 e nenhuma escrita', async () => {
    const { client, captures } = makeAdmin([teacher('t1', 10)])
    vi.mocked(createAdminClient).mockReturnValue(client)

    const res = await GET(req())

    expect(res.status).toBe(403)
    expect(captures.update).toBeNull()
    expect(insertNotifications).not.toHaveBeenCalled()
  })

  it('Bearer errado → 403', async () => {
    const { client } = makeAdmin([teacher('t1', 10)])
    vi.mocked(createAdminClient).mockReturnValue(client)

    const res = await GET(req('secret-errado'))

    expect(res.status).toBe(403)
  })

  it('respeita a carência de 3 dias — vencido ontem NÃO é suspenso', async () => {
    // O professor pagou por PIX e o dinheiro ainda não compensou. Suspender
    // aqui é justamente o que a carência existe pra evitar.
    const { client, captures } = makeAdmin([teacher('t1', 1)])
    vi.mocked(createAdminClient).mockReturnValue(client)

    const res = await GET(req(CRON_SECRET))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ ok: true, suspended: 0 })
    expect(captures.update).toBeNull()
    expect(insertNotifications).not.toHaveBeenCalled()
  })

  it('suspende quem passou da carência', async () => {
    const { client, captures } = makeAdmin([teacher('t1', 10)])
    vi.mocked(createAdminClient).mockReturnValue(client)

    const res = await GET(req(CRON_SECRET))
    const body = await res.json()

    expect(body).toEqual({ ok: true, suspended: 1 })
    expect(captures.update).toMatchObject({ plan_status: 'cancelled' })
    expect(captures.updatedIds).toEqual(['t1'])
  })

  it('o corte fica ~3 dias no passado, não no presente', async () => {
    const { client, captures } = makeAdmin([teacher('t1', 10)])
    vi.mocked(createAdminClient).mockReturnValue(client)

    await GET(req(CRON_SECRET))

    const cutoffMs = new Date(String(captures.cutoff)).getTime()
    const expected = Date.now() - 3 * 24 * 60 * 60 * 1000
    // Tolerância de 1 min pro tempo de execução do teste.
    expect(Math.abs(cutoffMs - expected)).toBeLessThan(60_000)
  })

  it('só toca plano PAGO e ATIVO', async () => {
    const { client, captures } = makeAdmin([teacher('t1', 10)])
    vi.mocked(createAdminClient).mockReturnValue(client)

    await GET(req(CRON_SECRET))

    expect(captures.filters['eq:plan_status']).toBe('active')
    expect(captures.filters['neq:plan_tier_key']).toBe('free')
  })

  it('ignora quem já está cancelado e quem é free', async () => {
    const { client, captures } = makeAdmin([
      teacher('ja-cancelado', 30, { plan_status: 'cancelled' } as Partial<TeacherRow>),
      teacher('free', 30, { plan_tier_key: 'free' }),
    ])
    vi.mocked(createAdminClient).mockReturnValue(client)

    const body = await (await GET(req(CRON_SECRET))).json()

    expect(body.suspended).toBe(0)
    expect(captures.update).toBeNull()
  })

  it('notifica cada professor suspenso com billing_issue', async () => {
    const { client } = makeAdmin([teacher('t1', 10), teacher('t2', 20)])
    vi.mocked(createAdminClient).mockReturnValue(client)

    await GET(req(CRON_SECRET))

    expect(insertNotifications).toHaveBeenCalledTimes(1)
    const notifs = vi.mocked(insertNotifications).mock.calls[0][0] as Array<Record<string, unknown>>
    expect(notifs).toHaveLength(2)
    expect(notifs[0]).toMatchObject({
      user_id: 'user-t1',
      type: 'billing_issue',
      is_read: false,
    })
    expect(notifs.map((n) => n.recipient_id)).toEqual(['user-t1', 'user-t2'])
  })

  it('erro de leitura no banco não vira suspensão silenciosa', async () => {
    const { client, captures } = makeAdmin([teacher('t1', 10)], {
      selectError: { message: 'connection reset', code: '08006' },
    })
    vi.mocked(createAdminClient).mockReturnValue(client)

    const res = await GET(req(CRON_SECRET))

    expect(res.status).toBe(500)
    expect(captures.update).toBeNull()
    expect(insertNotifications).not.toHaveBeenCalled()
  })

  it('falha no UPDATE não notifica ninguém', async () => {
    // Notificar "seu plano foi suspenso" sem ter suspendido é pior que não
    // notificar: o professor vai ao suporte por um evento que não aconteceu.
    const { client } = makeAdmin([teacher('t1', 10)], {
      updateError: { message: 'deadlock detected', code: '40P01' },
    })
    vi.mocked(createAdminClient).mockReturnValue(client)

    const res = await GET(req(CRON_SECRET))

    expect(res.status).toBe(500)
    expect(insertNotifications).not.toHaveBeenCalled()
  })
})
