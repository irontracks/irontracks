import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'

/**
 * O plano PRESCRITO pelo professor — e a orientação que ele escreve por refeição.
 *
 * O campo é o mesmo `meals[].note` que o aluno edita no plano PRÓPRIO
 * (`MyDietPlan`), mas aqui ele é somente leitura: alterar seria mexer na
 * prescrição de outra pessoa. É a mesma fronteira que já impede a troca de
 * alimento neste card.
 */

vi.mock('@/app/(app)/dashboard/nutrition/actions', () => ({
    applyGeneratedMealAction: vi.fn(async () => ({ ok: true })),
}))

import PrescribedDietPlan from '../PrescribedDietPlan'

const item = { food: 'Frango grelhado', grams: 200, calories: 330, protein: 62, carbs: 0, fat: 8 }

const planoCom = (note?: string) => ({
    id: 'pp1',
    plan_name: 'Plano do Coach',
    notes: null,
    created_at: '2026-08-01T10:00:00Z',
    meals: [{ name: 'Almoço', time: '12:00', items: [item], ...(note ? { note } : {}) }],
})

const mockFetch = (plan: unknown) => {
    vi.stubGlobal('fetch', vi.fn(async () => (
        { ok: true, status: 200, json: async () => ({ ok: true, plan }) } as unknown as Response
    )))
}

describe('PrescribedDietPlan — orientação do professor', () => {
    afterEach(() => { vi.unstubAllGlobals() })

    const abrirAlmoco = async () => {
        fireEvent.click(await screen.findByText('Almoço'))
    }

    it('mostra a orientação escrita na refeição, e diz de quem é', async () => {
        mockFetch(planoCom('mastigar devagar, sem líquido junto'))
        render(<PrescribedDietPlan dateKey="2026-08-03" canApply />)
        await abrirAlmoco()

        expect(await screen.findByText('mastigar devagar, sem líquido junto')).toBeTruthy()
        // Sem atribuição, o aluno lê como se fosse nota dele.
        expect(screen.getByText(/Orientação do professor/i)).toBeTruthy()
    })

    it('é SOMENTE LEITURA — o aluno não edita a prescrição de outra pessoa', async () => {
        mockFetch(planoCom('não trocar o frango'))
        const { container } = render(<PrescribedDietPlan dateKey="2026-08-03" canApply />)
        await abrirAlmoco()
        await screen.findByText('não trocar o frango')

        expect(container.querySelector('textarea'), 'campo editável no plano do coach').toBeNull()
        expect(container.querySelector('input'), 'campo editável no plano do coach').toBeNull()
    })

    it('refeição sem orientação não ganha bloco vazio', async () => {
        mockFetch(planoCom())
        render(<PrescribedDietPlan dateKey="2026-08-03" canApply />)
        await abrirAlmoco()
        await screen.findByText('Frango grelhado')

        expect(screen.queryByText(/Orientação do professor/i)).toBeNull()
    })

    it('a orientação da refeição não se confunde com a nota do PLANO inteiro', async () => {
        // São dois campos diferentes: `plan.notes` (o plano) e `meals[].note`
        // (a refeição). Já existiam os dois nomes, e trocá-los mostraria o
        // recado errado no lugar errado.
        mockFetch({ ...planoCom('recado da refeição'), notes: 'recado do plano inteiro' })
        render(<PrescribedDietPlan dateKey="2026-08-03" canApply />)

        expect(await screen.findByText('recado do plano inteiro')).toBeTruthy()
        await abrirAlmoco()
        await waitFor(() => expect(screen.getByText('recado da refeição')).toBeTruthy())
    })
})
