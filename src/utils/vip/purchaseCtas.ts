/**
 * Regra única de "posso mostrar CTA de compra nesta plataforma?".
 *
 * Antes isto vivia duplicado em três telas, com lógicas DIFERENTES:
 *   VipHub.tsx            → isIosNative() && !iapEnabled
 *   HeaderActionsMenu.tsx → isIosNative()                 (ignorava a flag de IAP)
 *   NutritionMixer.tsx    → isIosNative()                 (ignorava a flag de IAP)
 * Resultado: com o IAP ligado, o hub mostrava o CTA e o menu do header escondia.
 *
 * As lojas cobram por caminhos de compra fora do billing delas quando o produto é
 * bem digital:
 *  • iOS   — sem o IAP da Apple ligado, não pode haver caminho de compra próprio.
 *  • Android — o app oferece PIX/cartão e NÃO tem Play Billing implementado; é o
 *    cenário clássico de reprovação/remoção pela política de bens digitais.
 * Na web não há loja no meio: o CTA aparece normalmente.
 */

import { isAndroidNative, isIosNative } from '@/utils/platform'

/** O IAP da Apple está ligado neste build? */
export function isAppleIapEnabled(): boolean {
    return String(process.env.NEXT_PUBLIC_ENABLE_IAP || '').trim().toLowerCase() === 'true'
}

/**
 * Motivo pelo qual o CTA de compra deve sumir — null quando pode aparecer.
 * Devolve motivo (em vez de boolean) pra telemetria e depuração saberem QUAL loja
 * bloqueou, sem precisar reconstruir a condição.
 */
export function purchaseCtaBlockReason(): 'ios_sem_iap' | 'android_sem_play_billing' | null {
    if (isIosNative()) return isAppleIapEnabled() ? null : 'ios_sem_iap'
    // Android não tem Play Billing implementado — enquanto não tiver, nenhum
    // caminho de compra pode aparecer dentro do app.
    if (isAndroidNative()) return 'android_sem_play_billing'
    return null
}

/** Conveniência: esconder o CTA de compra nesta plataforma? */
export function shouldHidePurchaseCtas(): boolean {
    return purchaseCtaBlockReason() !== null
}
