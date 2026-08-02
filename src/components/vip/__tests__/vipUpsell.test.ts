import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * O paywall que VENDE (02/08/2026). O que havia nos pontos de limite: um
 * `confirm()` de sistema no Wizard e um X vermelho genérico no upload de exame
 * — um "não" seco no único momento em que vender funciona (a pessoa acabou de
 * PEDIR a feature).
 */
const CARD = readFileSync('src/components/vip/VipUpsellCard.tsx', 'utf8')
const WIZARD = readFileSync('src/components/dashboard/WorkoutWizardModal.tsx', 'utf8')
const UPLOAD = readFileSync('src/components/lab-exams/LabExamUploadModal.tsx', 'utf8')

describe('VipUpsellCard', () => {
    it('mede impressão e clique — sem isso a conversão do elo é invisível', () => {
        expect(CARD).toMatch(/trackUserEvent\('paywall_shown'/)
        expect(CARD).toMatch(/trackUserEvent\('paywall_cta'/)
    })

    it('vende VALOR por feature, não um aviso genérico', () => {
        expect(CARD).toMatch(/wizard:/)
        expect(CARD).toMatch(/lab_exams:/)
        expect(CARD).toMatch(/Seu primeiro exame foi por nossa conta/)
    })

    it('nunca é beco sem saída — "Agora não" sempre existe', () => {
        expect(CARD).toMatch(/Agora não/)
        expect(CARD).toMatch(/onDismiss: \(\) => void/)
    })

    it('CTA leva ao marketplace', () => {
        expect(CARD).toMatch(/window\.location\.href = '\/marketplace'/)
    })
})

describe('fiação nos pontos de desejo', () => {
    it('wizard esgotado mostra o card, não um confirm() de sistema', () => {
        expect(WIZARD).toMatch(/setShowUpsell\(true\)/)
        expect(WIZARD).toMatch(/<VipUpsellCard feature="wizard"/)
        expect(WIZARD).not.toMatch(/Seus créditos do Wizard acabaram/)
    })

    it('o card do wizard cobre os passos e o reset do modal o limpa', () => {
        // Sem o reset, reabrir o modal depois de dispensar mostraria o paywall
        // de novo mesmo com créditos renovados.
        expect(WIZARD).toMatch(/\{!showUpsell && step === 0 &&/)
        // ancorado no bloco de reset do isOpen — o onDismiss também chama
        // setShowUpsell(false) e um match solto passaria sem o reset (verificado).
        expect(WIZARD).toMatch(/setSavingAll\(false\)\s*\n\s*setShowUpsell\(false\)/)
    })

    it('segundo exame sem VIP mostra o card, não o X vermelho', () => {
        expect(UPLOAD).toMatch(/created\.error === 'vip_required'.*setStage\('upsell'\)/)
        expect(UPLOAD).toMatch(/<VipUpsellCard feature="lab_exams"/)
    })

    it('erro comum continua caindo no fluxo de erro — upsell é SÓ para vip_required', () => {
        // Tratar toda falha como paywall venderia VIP para quem sofreu um bug.
        expect(UPLOAD).toMatch(/throw new Error\(created\.message \|\| created\.error \|\| 'Falha ao criar exame\.'\)/)
    })
})
