/**
 * Guards do A9/A10 (auditoria de cobranças 14/08/2026) — cliente IAP.
 *
 * A9: `iapPackageForPlan` FALHA FECHADO. O fallback antigo (`pkgs[0]`) fazia o
 * app comprar "o primeiro pacote disponível" quando o SKU do plano não estava
 * no offering — plano errado cobrado de verdade num offering incompleto ou com
 * SKU renomeado.
 *
 * A10: identidade do RevenueCat é um singleton — configure UMA vez, logIn na
 * troca de conta. Configurar de novo a cada tela com outro appUserID mistura o
 * estado de duas contas no mesmo aparelho.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'

vi.mock('@revenuecat/purchases-capacitor', () => ({
  Purchases: {
    configure: vi.fn(async () => {}),
    logIn: vi.fn(async () => ({})),
  },
}))

import { Purchases } from '@revenuecat/purchases-capacitor'
import { iapPackageForPlan } from '@/lib/iap/packageForPlan'
import { ensureRevenueCatIdentity, __resetRevenueCatIdentityForTests } from '@/lib/iap/revenuecatIdentity'
import type { PurchasesOfferings } from '@revenuecat/purchases-capacitor'

const offeringsWith = (ids: string[]) => ({
  current: {
    availablePackages: ids.map((id) => ({ product: { identifier: id } })),
  },
}) as unknown as PurchasesOfferings

describe('iapPackageForPlan — mapeamento plano→SKU fail-closed (A9)', () => {
  it('correspondência exata vence', () => {
    const pkg = iapPackageForPlan(offeringsWith(['vip_start_month', 'vip_pro_month']), 'vip_pro_month')
    expect(pkg?.product?.identifier).toBe('vip_pro_month')
  })

  it('correspondência por contains cobre variação de sufixo do SKU', () => {
    const pkg = iapPackageForPlan(offeringsWith(['vip_pro1_month']), 'vip_pro')
    expect(pkg?.product?.identifier).toBe('vip_pro1_month')
  })

  it('SEM correspondência → null, mesmo com pacotes disponíveis (nunca pkgs[0])', () => {
    // É o caso que o fallback antigo quebrava: offering só com o Start, plano
    // pedido é o Elite → pkgs[0] compraria o Start no lugar do Elite.
    const pkg = iapPackageForPlan(offeringsWith(['vip_start_month']), 'vip_elite')
    expect(pkg).toBeNull()
  })

  it('offering vazio ou nulo → null', () => {
    expect(iapPackageForPlan(offeringsWith([]), 'vip_pro')).toBeNull()
    expect(iapPackageForPlan(null, 'vip_pro')).toBeNull()
  })
})

describe('ensureRevenueCatIdentity — ciclo de identidade (A10)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __resetRevenueCatIdentityForTests()
  })

  it('primeira chamada configura com o appUserID', async () => {
    await ensureRevenueCatIdentity('key-1', 'user-a')
    expect(vi.mocked(Purchases.configure)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(Purchases.configure)).toHaveBeenCalledWith({ apiKey: 'key-1', appUserID: 'user-a' })
    expect(vi.mocked(Purchases.logIn)).not.toHaveBeenCalled()
  })

  it('mesmo usuário de novo → no-op (não reconfigura)', async () => {
    await ensureRevenueCatIdentity('key-1', 'user-a')
    await ensureRevenueCatIdentity('key-1', 'user-a')
    expect(vi.mocked(Purchases.configure)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(Purchases.logIn)).not.toHaveBeenCalled()
  })

  it('TROCA de conta → logIn com a nova identidade, sem reconfigurar', async () => {
    await ensureRevenueCatIdentity('key-1', 'user-a')
    await ensureRevenueCatIdentity('key-1', 'user-b')
    expect(vi.mocked(Purchases.configure)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(Purchases.logIn)).toHaveBeenCalledWith({ appUserID: 'user-b' })
  })

  it('sem usuário → erro (nunca configura anônimo por acidente)', async () => {
    await expect(ensureRevenueCatIdentity('key-1', '')).rejects.toThrow()
    expect(vi.mocked(Purchases.configure)).not.toHaveBeenCalled()
  })
})

describe('MarketplaceClient — fiação dos guards (source-guard)', () => {
  const src = readFileSync('src/app/marketplace/MarketplaceClient.tsx', 'utf8')

  it('não chama Purchases.configure direto — identidade passa pelo singleton', () => {
    expect(src).not.toMatch(/Purchases\.configure\(/)
    expect(src).toMatch(/ensureRevenueCatIdentity\(/)
  })

  it('não tem fallback pkgs[0] — o pacote vem do resolver fail-closed', () => {
    expect(src).not.toMatch(/pkgs\[0\]/)
    expect(src).toMatch(/iapPackageForPlan\(/)
  })
})
