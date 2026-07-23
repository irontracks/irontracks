import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * A regra de esconder CTA de compra estava duplicada em 3 telas com lógicas
 * divergentes (o header ignorava a flag de IAP e o hub não). Estes testes travam
 * a regra única — e, principalmente, o caso Android, que é risco de política:
 * o app oferece PIX/cartão para bem digital sem Play Billing.
 */
vi.mock('@/utils/platform', () => ({
    isIosNative: vi.fn(() => false),
    isAndroidNative: vi.fn(() => false),
}))

import { isAndroidNative, isIosNative } from '@/utils/platform'
import { purchaseCtaBlockReason, shouldHidePurchaseCtas, isAppleIapEnabled } from '../purchaseCtas'

const mockIos = isIosNative as unknown as ReturnType<typeof vi.fn>
const mockAndroid = isAndroidNative as unknown as ReturnType<typeof vi.fn>

const setPlatform = (p: 'web' | 'ios' | 'android') => {
    mockIos.mockReturnValue(p === 'ios')
    mockAndroid.mockReturnValue(p === 'android')
}

const ORIGINAL_IAP = process.env.NEXT_PUBLIC_ENABLE_IAP

beforeEach(() => setPlatform('web'))
afterEach(() => { process.env.NEXT_PUBLIC_ENABLE_IAP = ORIGINAL_IAP })

describe('CTA de compra por plataforma', () => {
    it('web: sempre mostra (não há loja no meio)', () => {
        setPlatform('web')
        process.env.NEXT_PUBLIC_ENABLE_IAP = 'false'
        expect(purchaseCtaBlockReason()).toBeNull()
        expect(shouldHidePurchaseCtas()).toBe(false)
    })

    it('iOS sem IAP: esconde', () => {
        setPlatform('ios')
        process.env.NEXT_PUBLIC_ENABLE_IAP = 'false'
        expect(purchaseCtaBlockReason()).toBe('ios_sem_iap')
    })

    it('iOS com IAP: mostra (a compra passa pela Apple)', () => {
        setPlatform('ios')
        process.env.NEXT_PUBLIC_ENABLE_IAP = 'true'
        expect(purchaseCtaBlockReason()).toBeNull()
    })

    it('Android: esconde SEMPRE — não há Play Billing', () => {
        setPlatform('android')
        for (const flag of ['true', 'false', '']) {
            process.env.NEXT_PUBLIC_ENABLE_IAP = flag
            // A flag é da Apple; não pode liberar o caminho de compra no Android.
            expect(purchaseCtaBlockReason()).toBe('android_sem_play_billing')
        }
    })

    it('a flag de IAP tolera espaço e maiúscula', () => {
        process.env.NEXT_PUBLIC_ENABLE_IAP = '  TRUE  '
        expect(isAppleIapEnabled()).toBe(true)
        process.env.NEXT_PUBLIC_ENABLE_IAP = 'yes'
        expect(isAppleIapEnabled()).toBe(false)
    })
})
