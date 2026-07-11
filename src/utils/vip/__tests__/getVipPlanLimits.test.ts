/**
 * Behavioral tests da PRECEDÊNCIA de getVipPlanLimits — a resolução em 3 camadas
 * (role → user_entitlements → app_subscriptions → free) que decide o VIP de todo
 * request. A auditoria de cobertura apontou que essa resolução nunca era exercida
 * no código real (só as funções puras de limite eram testadas por cópia).
 *
 * Mockamos o Supabase por tabela. O filtro de DATA (valid_until / current_period_end)
 * roda no PostgREST, não em JS — então aqui devolvemos o resultado "já filtrado" e
 * focamos na lógica de resolução (precedência, limits_override, plano ausente). Os
 * filtros de data em si têm guards próprios (entitlementDateFilter / appSubscriptionExpiry).
 */
import { describe, it, expect, vi } from 'vitest'
import { getVipPlanLimits } from '@/utils/vip/limits'

type Row = Record<string, unknown> | null

function makeSupabase(data: {
  role?: string | null
  entitlement?: Row
  appSub?: Row
  planLimits?: Record<string, unknown> | null
}) {
  const from = vi.fn((table: string) => {
    const chain: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'in', 'lte', 'or', 'order', 'limit']) chain[m] = vi.fn(() => chain)
    chain.single = vi.fn(async () => (table === 'profiles'
      ? { data: data.role !== undefined ? { role: data.role } : null }
      : { data: null }))
    chain.maybeSingle = vi.fn(async () => {
      if (table === 'user_entitlements') return { data: data.entitlement ?? null }
      if (table === 'app_subscriptions') return { data: data.appSub ?? null }
      if (table === 'app_plans') return { data: data.planLimits ? { limits: data.planLimits } : null }
      return { data: null }
    })
    return chain
  })
  return { from } as never
}

const activeEnt = (plan_id: string, extra: Record<string, unknown> = {}) => ({
  id: 'ent-1', plan_id, status: 'active', valid_from: '2020-01-01T00:00:00Z',
  valid_until: null, limits_override: {}, ...extra,
})

describe('getVipPlanLimits — precedência das camadas', () => {
  it('1. role=admin → vip_elite (source=role), ignorando entitlement/app_sub', async () => {
    const sb = makeSupabase({ role: 'admin', entitlement: activeEnt('vip_start'), appSub: { id: 'x', plan_id: 'vip_start', status: 'active' } })
    const r = await getVipPlanLimits(sb, 'u1')
    expect(r.tier).toBe('vip_elite')
    expect(r.source).toBe('role')
  })

  it('2. role=teacher → vip_elite (source=role)', async () => {
    const r = await getVipPlanLimits(makeSupabase({ role: 'teacher' }), 'u1')
    expect(r.tier).toBe('vip_elite')
    expect(r.source).toBe('role')
  })

  it('3. sem role, entitlement ativo → resolve o plano do entitlement', async () => {
    const sb = makeSupabase({ role: 'user', entitlement: activeEnt('vip_pro'), planLimits: {} })
    const r = await getVipPlanLimits(sb, 'u1')
    expect(r.tier).toBe('vip_pro')
    expect(r.source).toBe('entitlement_table')
  })

  it('4. limits_override do entitlement vence o plano', async () => {
    // tier custom (não-vip) pra o override não sofrer cap; chat_daily do override deve passar.
    const sb = makeSupabase({ role: 'user', entitlement: activeEnt('custom', { limits_override: { chat_daily: 123 } }) })
    const r = await getVipPlanLimits(sb, 'u1')
    expect(r.source).toBe('entitlement_table')
    expect(r.limits.chat_daily).toBe(123)
  })

  it('5. sem role e sem entitlement, mas app_subscription ativa → fallback legado', async () => {
    const sb = makeSupabase({ role: 'user', entitlement: null, appSub: { id: 's1', plan_id: 'vip_start', status: 'active' }, planLimits: {} })
    const r = await getVipPlanLimits(sb, 'u1')
    expect(r.tier).toBe('vip_start')
    expect(r.source).toBe('app_subscription')
  })

  it('6. nada resolve → free', async () => {
    const r = await getVipPlanLimits(makeSupabase({ role: 'user', entitlement: null, appSub: null }), 'u1')
    expect(r.tier).toBe('free')
    expect(r.source).toBe('free_no_subscription')
  })

  it('7. entitlement vence app_subscription quando ambos existem', async () => {
    const sb = makeSupabase({
      role: 'user',
      entitlement: activeEnt('vip_elite'),
      appSub: { id: 's1', plan_id: 'vip_start', status: 'active' },
      planLimits: {},
    })
    const r = await getVipPlanLimits(sb, 'u1')
    expect(r.tier).toBe('vip_elite')
    expect(r.source).toBe('entitlement_table')
  })

  it('8. entitlement com plano inexistente NÃO concede (cai pra free, não pro plano)', async () => {
    // fetchPlanLimits devolve null → não pode conceder um plano fantasma.
    const sb = makeSupabase({ role: 'user', entitlement: activeEnt('plano_fantasma'), planLimits: null })
    const r = await getVipPlanLimits(sb, 'u1')
    expect(r.tier).toBe('free')
    expect(r.source).toBe('entitlement_missing_plan')
  })
})
