import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, cleanup } from '@testing-library/react'

/**
 * `wizard_abandoned` não pode nascer no MOUNT.
 *
 * ⚠️ Este é um teste de COMPORTAMENTO de propósito. O guard que já existia
 * (`workoutWizardFunnel.test.ts`) é inteiro `expect(SRC).toMatch(...)` — ele
 * confere a FORMA do código e nunca monta o componente, e por isso ficou VERDE
 * enquanto o evento mais importante do funil virava ruído.
 *
 * O defeito: o dashboard monta o wizard SEM CONDICIONAL
 * (`<WorkoutWizardModal isOpen={x} />`, não `{x && <WorkoutWizardModal/>}`), e o
 * efeito de abandono só testava `isOpen` e `outcomeRef`. Na primeira
 * renderização as duas guardas passam — logo TODA abertura do dashboard gravava
 * um abandono de um wizard que ninguém abriu.
 *
 * Medido em produção em 10/09/2026: **1.207 de 1.213 eventos (99,5%)** no passo 0
 * com `interagiu: false`; uma conta com 128 abandonos e ZERO `wizard_open`.
 */

const track = vi.fn()
vi.mock('@/lib/telemetry/userActivity', () => ({
    trackUserEvent: (...args: unknown[]) => track(...args),
}))
vi.mock('@/hooks/useVipCredits', () => ({ useVipCredits: () => ({ credits: null, refresh: vi.fn() }) }))
vi.mock('@/hooks/useFocusTrap', () => ({ useFocusTrap: () => ({ current: null }) }))
vi.mock('next/dynamic', () => ({ default: () => () => null }))
vi.mock('next/image', () => ({ default: () => null }))

const props = {
    onClose: vi.fn(),
    onManual: vi.fn(),
    onGenerate: vi.fn(),
    onUseDraft: vi.fn(),
    onSaveDrafts: vi.fn(),
}

const eventos = (nome: string) => track.mock.calls.filter((c) => c[0] === nome)

beforeEach(() => { cleanup(); track.mockClear() })

describe('wizard_abandoned só existe se o wizard foi ABERTO', () => {
    it('montar fechado NÃO emite abandono', async () => {
        const { default: WorkoutWizardModal } = await import('../WorkoutWizardModal')
        render(<WorkoutWizardModal isOpen={false} {...props} />)

        expect(
            eventos('wizard_abandoned'),
            'abandono emitido no mount — é o defeito que fez 99,5% dos eventos virarem ruído',
        ).toHaveLength(0)
    })

    it('montar fechado e re-renderizar fechado continua sem emitir', async () => {
        const { default: WorkoutWizardModal } = await import('../WorkoutWizardModal')
        const { rerender } = render(<WorkoutWizardModal isOpen={false} {...props} />)
        rerender(<WorkoutWizardModal isOpen={false} {...props} />)

        expect(eventos('wizard_abandoned')).toHaveLength(0)
    })

    it('abrir e fechar SEM desfecho emite exatamente UM abandono', async () => {
        // É o caso que o evento existe para medir: a pessoa viu a primeira tela
        // e desistiu. Ele não pode ser perdido junto com o ruído.
        const { default: WorkoutWizardModal } = await import('../WorkoutWizardModal')
        const { rerender } = render(<WorkoutWizardModal isOpen={false} {...props} />)
        rerender(<WorkoutWizardModal isOpen {...props} />)
        rerender(<WorkoutWizardModal isOpen={false} {...props} />)

        expect(eventos('wizard_abandoned'), 'o abandono REAL deixou de ser medido').toHaveLength(1)
        expect(eventos('wizard_open')).toHaveLength(1)
    })
})
