import { Purchases } from '@revenuecat/purchases-capacitor'

let configuredUserId: string | null = null

/**
 * A10 (auditoria de cobranças 14/08/2026): o SDK do RevenueCat deve ser
 * configurado UMA vez por sessão da WebView e trocar de identidade via
 * `logIn` — o padrão antigo (Purchases.configure a cada mount da tela, com o
 * appUserID da vez) deixa o estado do cliente imprevisível quando duas contas
 * usam o mesmo aparelho: compra/entitlement de uma conta podia "vazar" para a
 * outra. O singleton vive no módulo (a WebView é uma sessão só); trocar de
 * usuário → logIn, mesmo usuário → no-op.
 */
export async function ensureRevenueCatIdentity(apiKey: string, userId: string): Promise<void> {
  const uid = String(userId || '').trim()
  if (!uid) throw new Error('revenuecat_identity_sem_usuario')
  if (configuredUserId === null) {
    await Purchases.configure({ apiKey, appUserID: uid })
    configuredUserId = uid
    return
  }
  if (configuredUserId !== uid) {
    await Purchases.logIn({ appUserID: uid })
    configuredUserId = uid
  }
}

/** Só para testes: zera o singleton (cada caso começa sem identidade). */
export function __resetRevenueCatIdentityForTests(): void {
  configuredUserId = null
}
