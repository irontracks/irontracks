import type { PurchasesOfferings, PurchasesPackage } from '@revenuecat/purchases-capacitor'

/**
 * A9 (auditoria de cobranças 14/08/2026): resolve o pacote do RevenueCat para
 * um plano por correspondência de SKU — exata primeiro, depois por contains —
 * e FALHA FECHADO (null) quando não há correspondência. O fallback antigo
 * (`pkgs[0]`, "compra o primeiro pacote disponível") podia cobrar o plano
 * ERRADO num offering incompleto ou com SKU renomeado; o chamador já trata
 * null com "Produto indisponível na App Store para este plano".
 */
export function iapPackageForPlan(
  offerings: PurchasesOfferings | null,
  planId: string | null | undefined,
): PurchasesPackage | null {
  const id = String(planId || '').trim()
  if (!offerings || !id) return null
  const current = offerings.current
  const pkgs: PurchasesPackage[] = Array.isArray(current?.availablePackages) ? current.availablePackages : []
  if (!pkgs.length) return null
  const exact = pkgs.find((p) => String(p?.product?.identifier || '').trim() === id)
  if (exact) return exact
  const loose = pkgs.find((p) => String(p?.product?.identifier || '').includes(id))
  return loose ?? null
}
