/**
 * Comportamento dos crons restantes sem cobertura (mapa 2026-07-28).
 *
 * A autorização dos 16 já está travada por classe em `cronAuthGuard.test.ts`.
 * Aqui vai o que cada um faz depois de autorizado — e o foco é onde o erro é
 * caro e silencioso: janelas de tempo (avisar cedo/tarde ou não avisar) e
 * exclusões por corte de data (apagar o que ainda estava em uso).
 *
 * Coberto:
 *  • clean-live-activity-tokens — corte de 24h, tabela ausente não vira 500,
 *    trilha de auditoria com o que foi apagado;
 *  • purge-soft-delete-bin — só apaga o que já venceu o prazo de retenção;
 *  • teacher-plan-expiring — avisa nas janelas de 3 dias e 1 dia, e não avisa
 *    quem está fora delas.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const CRON_SECRET = 'test-cron-secret'
vi.hoisted(() => { process.env.CRON_SECRET = 'test-cron-secret' })

vi.mock('@/utils/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/social/notifyFollowers', () => ({ insertNotifications: vi.fn(async () => {}) }))
vi.mock('@/lib/logger', () => ({ logInfo: vi.fn(), logWarn: vi.fn(), logError: vi.fn() }))

import { createAdminClient } from '@/utils/supabase/admin'
import { insertNotifications } from '@/lib/social/notifyFollowers'
import { GET as cleanTokens } from '../clean-live-activity-tokens/route'
import { GET as purgeBin } from '../purge-soft-delete-bin/route'
import { GET as planExpiring } from '../teacher-plan-expiring/route'

const req = (path: string, secret: string | null = CRON_SECRET) =>
  new Request(`https://irontracks.com.br/api/cron/${path}`, {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  })

const HOUR = 60 * 60 * 1000

// ── clean-live-activity-tokens ───────────────────────────────────────────────

describe('cron clean-live-activity-tokens', () => {
  beforeEach(() => { vi.clearAllMocks() })

  function makeAdmin(opts: { rows?: Array<Record<string, unknown>>; error?: Record<string, unknown> } = {}) {
    const captured: { cutoff: string | null; audit: Record<string, unknown> | null } = { cutoff: null, audit: null }
    const from = vi.fn((table: string) => {
      const chain: Record<string, unknown> = {}
      chain.delete = vi.fn(() => chain)
      chain.lt = vi.fn((_col: string, val: string) => { captured.cutoff = val; return chain })
      chain.select = vi.fn(async () => ({ data: opts.rows ?? [], error: opts.error ?? null }))
      chain.insert = vi.fn(async (payload: Record<string, unknown>) => {
        if (table === 'audit_events') captured.audit = payload
        return { error: null }
      })
      return chain
    })
    return { client: { from } as unknown as ReturnType<typeof createAdminClient>, captured }
  }

  it('sem autorização → 403', async () => {
    const { client } = makeAdmin()
    vi.mocked(createAdminClient).mockReturnValue(client)
    expect((await cleanTokens(req('clean-live-activity-tokens', null))).status).toBe(403)
  })

  it('corta em 24h — nenhuma Live Activity do app vive tanto', async () => {
    // Encurtar esse corte apagaria o token de uma activity ainda no ar, e o
    // push seguinte cairia no vazio: a Ilha Dinâmica congela sem erro.
    const { client, captured } = makeAdmin({ rows: [{ user_id: 'u1' }] })
    vi.mocked(createAdminClient).mockReturnValue(client)

    await cleanTokens(req('clean-live-activity-tokens'))

    const cutoffMs = new Date(String(captured.cutoff)).getTime()
    expect(Math.abs(cutoffMs - (Date.now() - 24 * HOUR))).toBeLessThan(60_000)
  })

  it('registra o que foi apagado', async () => {
    const { client, captured } = makeAdmin({ rows: [{ user_id: 'u1' }, { user_id: 'u2' }] })
    vi.mocked(createAdminClient).mockReturnValue(client)

    const body = await (await cleanTokens(req('clean-live-activity-tokens'))).json()

    expect(body).toMatchObject({ ok: true })
    expect(captured.audit).toMatchObject({ actor_role: 'service', action: 'cron_clean_live_activity_tokens' })
    expect((captured.audit?.metadata as Record<string, unknown>)?.deletedRows).toBe(2)
  })

  it('tabela ainda não migrada → deferred, não 500', async () => {
    // O cron roda em ambiente onde a migration pode não ter subido ainda;
    // devolver 500 aqui geraria alarme falso todo dia.
    const { client } = makeAdmin({ error: { code: '42P01', message: 'relation does not exist' } })
    vi.mocked(createAdminClient).mockReturnValue(client)

    const res = await cleanTokens(req('clean-live-activity-tokens'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({ ok: true, deferred: true })
  })

  it('erro real de banco → 500', async () => {
    const { client } = makeAdmin({ error: { code: '08006', message: 'connection reset' } })
    vi.mocked(createAdminClient).mockReturnValue(client)

    expect((await cleanTokens(req('clean-live-activity-tokens'))).status).toBe(500)
  })
})

// ── purge-soft-delete-bin ────────────────────────────────────────────────────

describe('cron purge-soft-delete-bin', () => {
  beforeEach(() => { vi.clearAllMocks() })

  function makeAdmin(rows: Array<{ id: string; purge_after: string }>) {
    const captured: { cutoff: string | null; deletedIds: string[] | null; audit: Record<string, unknown> | null } = {
      cutoff: null, deletedIds: null, audit: null,
    }
    const from = vi.fn((table: string) => {
      const chain: Record<string, unknown> = {}
      let working = [...rows]
      chain.select = vi.fn(() => chain)
      chain.lte = vi.fn((_col: string, val: string) => {
        captured.cutoff = val
        working = working.filter((r) => r.purge_after <= val)
        return chain
      })
      chain.limit = vi.fn(async () => ({ data: working, error: null }))
      chain.delete = vi.fn(() => ({
        in: vi.fn(async (_col: string, ids: string[]) => { captured.deletedIds = ids; return { error: null } }),
      }))
      chain.insert = vi.fn(async (payload: Record<string, unknown>) => {
        if (table === 'audit_events') captured.audit = payload
        return { error: null }
      })
      return chain
    })
    return { client: { from } as unknown as ReturnType<typeof createAdminClient>, captured }
  }

  const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString()

  it('sem autorização → 403 e nada é apagado', async () => {
    const { client, captured } = makeAdmin([{ id: 'a', purge_after: iso(-HOUR) }])
    vi.mocked(createAdminClient).mockReturnValue(client)

    const res = await purgeBin(req('purge-soft-delete-bin', null))

    expect(res.status).toBe(403)
    expect(captured.deletedIds).toBeNull()
  })

  it('apaga só o que já passou do prazo de retenção', async () => {
    // O item que ainda está no prazo é justamente o que o usuário pode querer
    // de volta — apagá-lo cedo é perda definitiva.
    const { client, captured } = makeAdmin([
      { id: 'vencido', purge_after: iso(-HOUR) },
      { id: 'ainda-no-prazo', purge_after: iso(+48 * HOUR) },
    ])
    vi.mocked(createAdminClient).mockReturnValue(client)

    const body = await (await purgeBin(req('purge-soft-delete-bin'))).json()

    expect(captured.deletedIds).toEqual(['vencido'])
    expect(body).toMatchObject({ ok: true, purged: 1 })
  })

  it('nada vencido → nenhum DELETE', async () => {
    const { client, captured } = makeAdmin([{ id: 'novo', purge_after: iso(+72 * HOUR) }])
    vi.mocked(createAdminClient).mockReturnValue(client)

    const body = await (await purgeBin(req('purge-soft-delete-bin'))).json()

    expect(captured.deletedIds).toBeNull()
    expect(body).toMatchObject({ purged: 0 })
  })

  it('deixa trilha do expurgo', async () => {
    const { client, captured } = makeAdmin([{ id: 'vencido', purge_after: iso(-HOUR) }])
    vi.mocked(createAdminClient).mockReturnValue(client)

    await purgeBin(req('purge-soft-delete-bin'))

    expect(captured.audit).toMatchObject({ actor_role: 'service', action: 'cron_purge_soft_delete_bin' })
  })
})

// ── teacher-plan-expiring ────────────────────────────────────────────────────

describe('cron teacher-plan-expiring', () => {
  beforeEach(() => { vi.clearAllMocks() })

  type Teacher = { user_id: string; plan_tier_key: string; plan_valid_until: string; plan_status?: string }

  function makeAdmin(teachers: Teacher[]) {
    const from = vi.fn(() => {
      let working = [...teachers]
      const chain: Record<string, unknown> = {}
      chain.select = vi.fn(() => chain)
      chain.eq = vi.fn((col: string, val: unknown) => {
        working = working.filter((t) => (t as unknown as Record<string, unknown>)[col] === val)
        return chain
      })
      chain.neq = vi.fn((col: string, val: unknown) => {
        working = working.filter((t) => (t as unknown as Record<string, unknown>)[col] !== val)
        return chain
      })
      chain.not = vi.fn(() => chain)
      chain.gte = vi.fn((col: string, val: string) => {
        working = working.filter((t) => String((t as unknown as Record<string, unknown>)[col]) >= val)
        return chain
      })
      chain.lt = vi.fn((col: string, val: string) => {
        working = working.filter((t) => String((t as unknown as Record<string, unknown>)[col]) < val)
        return chain
      })
      chain.limit = vi.fn(async () => ({ data: working, error: null }))
      return chain
    })
    return { client: { from } as unknown as ReturnType<typeof createAdminClient> }
  }

  const teacher = (id: string, hoursAhead: number): Teacher => ({
    user_id: id,
    plan_tier_key: 'pro',
    plan_valid_until: new Date(Date.now() + hoursAhead * HOUR).toISOString(),
    plan_status: 'active',
  })

  const notified = () =>
    vi.mocked(insertNotifications).mock.calls.flatMap((c) => (c[0] as Array<Record<string, unknown>>) ?? [])

  it('sem autorização → 403 e ninguém é avisado', async () => {
    const { client } = makeAdmin([teacher('t1', 70)])
    vi.mocked(createAdminClient).mockReturnValue(client)

    expect((await planExpiring(req('teacher-plan-expiring', null))).status).toBe(403)
    expect(insertNotifications).not.toHaveBeenCalled()
  })

  it('avisa quem vence em ~3 dias', async () => {
    const { client } = makeAdmin([teacher('t-3dias', 70)])
    vi.mocked(createAdminClient).mockReturnValue(client)

    await planExpiring(req('teacher-plan-expiring'))

    expect(notified().map((n) => n.user_id)).toContain('t-3dias')
  })

  it('avisa quem vence em ~1 dia', async () => {
    const { client } = makeAdmin([teacher('t-1dia', 20)])
    vi.mocked(createAdminClient).mockReturnValue(client)

    await planExpiring(req('teacher-plan-expiring'))

    expect(notified().map((n) => n.user_id)).toContain('t-1dia')
  })

  it('não avisa fora das janelas — nem cedo demais, nem depois de vencido', async () => {
    // Aviso repetido todo dia vira ruído e o professor para de ler; aviso
    // depois do vencimento chega quando o plano já caiu.
    const { client } = makeAdmin([
      teacher('t-longe', 240),   // 10 dias
      teacher('t-meio', 40),     // ~1,7 dia: entre as duas janelas
      teacher('t-vencido', -10), // já venceu
    ])
    vi.mocked(createAdminClient).mockReturnValue(client)

    await planExpiring(req('teacher-plan-expiring'))

    const ids = notified().map((n) => n.user_id)
    expect(ids).not.toContain('t-longe')
    expect(ids).not.toContain('t-meio')
    expect(ids).not.toContain('t-vencido')
  })

  it('ignora plano free', async () => {
    const { client } = makeAdmin([{ ...teacher('t-free', 20), plan_tier_key: 'free' }])
    vi.mocked(createAdminClient).mockReturnValue(client)

    await planExpiring(req('teacher-plan-expiring'))

    expect(notified().map((n) => n.user_id)).not.toContain('t-free')
  })
})
