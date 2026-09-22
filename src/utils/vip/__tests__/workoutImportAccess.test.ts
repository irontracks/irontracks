/**
 * Bug real de 22/09/2026: `checkWorkoutImportAccess` checava a feature
 * `analytics` (só true no Elite) em vez de uma feature básica de todo VIP —
 * cópia indevida de `labExamsAccess.ts` sem trocar a chave. Um usuário VIP
 * Start/Pro (a maioria dos pagantes) via a 2ª importação de ficha bloqueada
 * do mesmo jeito que o free, mesmo com o plano ativo. Achado ao investigar
 * por que Jean (VIP trial `vip_pro` concedido) continuava bloqueado.
 *
 * Mock: `checkVipFeatureAccess` é mockado no nível do módulo — o que este
 * arquivo precisa provar é QUAL FEATURE `checkWorkoutImportAccess` pede, não
 * reimplementar a resolução de plano (já coberta em checkVipFeatureAccess.test.ts
 * e getVipPlanLimits.test.ts).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { checkWorkoutImportAccess } from '@/utils/vip/workoutImportAccess'
import { checkVipFeatureAccess } from '@/utils/vip/limits'

vi.mock('@/utils/vip/limits', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/vip/limits')>()
  return { ...actual, checkVipFeatureAccess: vi.fn() }
})

const mockedCheckVip = vi.mocked(checkVipFeatureAccess)

function makeSupabaseCount(count: number) {
  const from = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ count, error: null }),
    }),
  })
  return { from } as never
}

describe('checkWorkoutImportAccess', () => {
  beforeEach(() => {
    mockedCheckVip.mockReset()
  })

  it('pede a feature workout_photo_import (não analytics) — guard anti-regressão do bug de 22/09', async () => {
    mockedCheckVip.mockResolvedValue({ allowed: true, currentUsage: 0, limit: 1, tier: 'vip_pro' })
    await checkWorkoutImportAccess(makeSupabaseCount(0), 'u1', 'create')
    expect(mockedCheckVip).toHaveBeenCalledWith(expect.anything(), 'u1', 'workout_photo_import', { meter: true })
  })

  it('VIP Pro (workout_photo_import=true) é aprovado direto, mesmo já tendo importado antes', async () => {
    mockedCheckVip.mockResolvedValue({ allowed: true, currentUsage: 3, limit: 20, tier: 'vip_pro' })
    const res = await checkWorkoutImportAccess(makeSupabaseCount(5), 'jean', 'create')
    expect(res).toEqual({ allowed: true, reason: 'vip', tier: 'vip_pro' })
  })

  it('sem VIP e zero imports anteriores: primeira grátis no create', async () => {
    mockedCheckVip.mockResolvedValue({ allowed: false, currentUsage: 0, limit: 0, tier: 'free' })
    const res = await checkWorkoutImportAccess(makeSupabaseCount(0), 'u1', 'create')
    expect(res).toEqual({ allowed: true, reason: 'first_free', tier: 'free' })
  })

  it('sem VIP e já usou a grátis: nega no create', async () => {
    mockedCheckVip.mockResolvedValue({ allowed: false, currentUsage: 0, limit: 0, tier: 'free' })
    const res = await checkWorkoutImportAccess(makeSupabaseCount(1), 'u1', 'create')
    expect(res).toEqual({ allowed: false, reason: 'denied', tier: 'free' })
  })

  it('sem VIP: process ainda libera com até 1 import (etapa que o create já deixou entrar)', async () => {
    mockedCheckVip.mockResolvedValue({ allowed: false, currentUsage: 0, limit: 0, tier: 'free' })
    const res = await checkWorkoutImportAccess(makeSupabaseCount(1), 'u1', 'process')
    expect(res.allowed).toBe(true)
    expect(res.reason).toBe('first_free')
  })
})
