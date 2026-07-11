/**
 * Behavioral tests para checkVipFeatureAccess — o gate que decide se uma feature
 * paga (chat/wizard/insights/lab_exams…) pode consumir Gemini. É onde o dinheiro
 * queima; até então tinha ZERO teste (a auditoria de cobertura o marcou como a
 * lacuna #1 de risco financeiro).
 *
 * Injetamos o plano já resolvido via `opts.plan` (a própria assinatura suporta
 * isso), então não precisamos mockar getVipPlanLimits — só o metering: o RPC
 * atômico `increment_vip_usage_daily` e a leitura de `vip_usage_daily`.
 *
 * Invariantes travados (todos apontados pela auditoria como risco real):
 *  - metering atômico (opts.meter) bloqueia no teto: a N-ésima unidade é permitida
 *    só se N <= limite (fronteira `<=` pós-incremento);
 *  - a checagem de display (sem meter) usa `<` — a diferença de 1 unidade entre
 *    display e consumo é intencional e não pode inverter;
 *  - teto anti-abuso de features booleanas (Gemini) aplica-se a não-role e é
 *    ISENTO para source='role' (admin/teacher);
 *  - cotas semanais (wizard/insights) somam a janela e bloqueiam em `< limite`.
 */
import { describe, it, expect, vi } from 'vitest'
import { checkVipFeatureAccess, FREE_LIMITS, UNLIMITED_LIMITS, type VipTierLimits } from '@/utils/vip/limits'

type Plan = { tier: string; limits: VipTierLimits; source: 'role' | 'entitlement_table' | 'app_subscription' | 'free_no_subscription' }

// Mock encadeável de Supabase no mesmo estilo de utils/__tests__/authRole.test.ts.
// `.eq()`/`.select()` devolvem a própria cadeia; `.maybeSingle()` e `.gte()` são
// terminais (devolvem Promise com { data }). `rpc` é espionado à parte.
function makeSupabase(opts: {
  rpcCount?: number
  usageRow?: { usage_count: number } | null
  weeklyRows?: Array<{ usage_count: number }>
}) {
  const rpc = vi.fn().mockResolvedValue({ data: opts.rpcCount ?? 0 })
  const from = vi.fn().mockImplementation(() => {
    const chain: Record<string, unknown> = {}
    chain.select = vi.fn(() => chain)
    chain.eq = vi.fn(() => chain)
    chain.gte = vi.fn(() => Promise.resolve({ data: opts.weeklyRows ?? [] }))
    chain.maybeSingle = vi.fn(() => Promise.resolve({ data: opts.usageRow ?? null }))
    return chain
  })
  return { rpc, from } as never
}

const planStart = (limits: Partial<VipTierLimits>): Plan => ({
  tier: 'vip_start',
  source: 'entitlement_table',
  limits: { ...FREE_LIMITS, ...limits },
})

describe('checkVipFeatureAccess — features booleanas (Gemini)', () => {
  it('nega quando o limite booleano é false (não é do tier)', async () => {
    const sb = makeSupabase({})
    const res = await checkVipFeatureAccess(sb, 'u1', 'nutrition_macros', {
      plan: planStart({ nutrition_macros: false }),
    })
    expect(res.allowed).toBe(false)
  })

  it('meter: permite a N-ésima chamada enquanto N <= teto anti-abuso', async () => {
    // lab_exams tem teto anti-abuso 50. rpc devolve a contagem pós-incremento.
    const noCeiling = await checkVipFeatureAccess(makeSupabase({ rpcCount: 50 }), 'u1', 'lab_exams', {
      plan: planStart({ lab_exams: true }), meter: true,
    })
    expect(noCeiling.allowed).toBe(true) // 50 <= 50

    const overCeiling = await checkVipFeatureAccess(makeSupabase({ rpcCount: 51 }), 'u1', 'lab_exams', {
      plan: planStart({ lab_exams: true }), meter: true,
    })
    expect(overCeiling.allowed).toBe(false) // 51 > 50
  })

  it('isenta o teto anti-abuso quando source=role (admin/teacher) — sem tocar no RPC', async () => {
    const sb = makeSupabase({})
    const res = await checkVipFeatureAccess(sb, 'u1', 'lab_exams', {
      plan: { tier: 'vip_elite', source: 'role', limits: { ...UNLIMITED_LIMITS } },
      meter: true,
    })
    expect(res.allowed).toBe(true)
    expect(sb.rpc).not.toHaveBeenCalled()
  })
})

describe('checkVipFeatureAccess — chat_daily (numérico)', () => {
  it('meter (não-free): permite enquanto a contagem pós-incremento <= limite', async () => {
    const atLimit = await checkVipFeatureAccess(makeSupabase({ rpcCount: 40 }), 'u1', 'chat_daily', {
      plan: { tier: 'vip_pro', source: 'entitlement_table', limits: { ...FREE_LIMITS, chat_daily: 40 } },
      meter: true,
    })
    expect(atLimit.allowed).toBe(true) // 40 <= 40

    const overLimit = await checkVipFeatureAccess(makeSupabase({ rpcCount: 41 }), 'u1', 'chat_daily', {
      plan: { tier: 'vip_pro', source: 'entitlement_table', limits: { ...FREE_LIMITS, chat_daily: 40 } },
      meter: true,
    })
    expect(overLimit.allowed).toBe(false) // 41 > 40
  })

  it('display (sem meter) usa `<`: na fronteira exata já bloqueia', async () => {
    // Contagem == limite: display nega (current < limit → 40<40 = false), enquanto o
    // meter permitiria (<=). Essa diferença de 1 unidade é intencional; o teste trava
    // que ela não se inverta.
    const res = await checkVipFeatureAccess(makeSupabase({ usageRow: { usage_count: 40 } }), 'u1', 'chat_daily', {
      plan: { tier: 'vip_pro', source: 'entitlement_table', limits: { ...FREE_LIMITS, chat_daily: 40 } },
    })
    expect(res.allowed).toBe(false)
    expect(res.currentUsage).toBe(40)
  })
})

describe('checkVipFeatureAccess — cotas semanais', () => {
  it('wizard_weekly: soma a janela e bloqueia em `< limite`', async () => {
    const under = await checkVipFeatureAccess(
      makeSupabase({ weeklyRows: [{ usage_count: 1 }, { usage_count: 1 }] }), 'u1', 'wizard_weekly',
      { plan: { tier: 'vip_pro', source: 'entitlement_table', limits: { ...FREE_LIMITS, wizard_weekly: 3 } } },
    )
    expect(under.allowed).toBe(true) // 2 < 3

    const atLimit = await checkVipFeatureAccess(
      makeSupabase({ weeklyRows: [{ usage_count: 2 }, { usage_count: 1 }] }), 'u1', 'wizard_weekly',
      { plan: { tier: 'vip_pro', source: 'entitlement_table', limits: { ...FREE_LIMITS, wizard_weekly: 3 } } },
    )
    expect(atLimit.allowed).toBe(false) // 3 < 3 = false
  })
})

describe('checkVipFeatureAccess — ilimitado', () => {
  it('limite null (ex.: history_days elite) → sempre permitido', async () => {
    const res = await checkVipFeatureAccess(makeSupabase({}), 'u1', 'history_days', {
      plan: { tier: 'vip_elite', source: 'entitlement_table', limits: { ...UNLIMITED_LIMITS, history_days: null } },
    })
    expect(res.allowed).toBe(true)
    expect(res.limit).toBeNull()
  })
})
