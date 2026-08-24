import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import NutritionHistoryModal from '@/components/dashboard/nutrition/NutritionHistoryModal'

/**
 * Histórico de nutrição — o irmão do Histórico de treino.
 *
 * A lista é um ATALHO DE NAVEGAÇÃO: tocar num dia abre aquele dia na própria
 * aba. Sem ela, chegar a três semanas atrás custava 21 toques na seta.
 */

const resposta = { data: [] as unknown[], error: null as unknown }

// Distinguir a TABELA é obrigatório: `nutrition_day_flags` tem a mesma cadeia
// select→eq→gte→lte, e um mock que ignora o nome devolveria as refeições como
// se fossem marcas de "dia incompleto" — sumindo com todos os dias da média.
vi.mock('@/utils/supabase/client', () => ({
    createClient: () => ({
        from: (tabela: string) => ({
            select: () => ({
                eq: () => ({
                    gte: () => ({
                        lte: () => Promise.resolve(tabela === 'nutrition_day_flags' ? { data: [], error: null } : resposta),
                    }),
                }),
            }),
            insert: () => Promise.resolve({ error: null }),
            delete: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
        }),
    }),
}))

const HOJE = '2026-08-16'

const abrir = (props: Partial<React.ComponentProps<typeof NutritionHistoryModal>> = {}) =>
    render(
        <NutritionHistoryModal
            open
            userId="u1"
            todayDate={HOJE}
            onPickDate={() => { }}
            onClose={() => { }}
            {...props}
        />,
    )

beforeEach(() => {
    resposta.data = [
        { date: '2026-08-16', calories: 900, protein: 70, carbs: 90, fat: 20 },
        { date: '2026-08-16', calories: 1500, protein: 110, carbs: 160, fat: 50 },
        { date: '2026-08-14', calories: 2000, protein: 150, carbs: 200, fat: 60 },
    ]
    resposta.error = null
})

describe('lista de dias', () => {
    it('mostra um dia por linha, com o total somado das refeições', async () => {
        abrir()
        expect(await screen.findByText('2400')).toBeInTheDocument()   // 900 + 1500
        expect(screen.getByText('2000')).toBeInTheDocument()
        expect(screen.getByText(/2 refeições/)).toBeInTheDocument()
    })

    it('tocar num dia abre aquele dia e fecha a janela', async () => {
        const onPickDate = vi.fn()
        const onClose = vi.fn()
        abrir({ onPickDate, onClose })
        const linha = await screen.findByRole('button', { name: /2000/ })
        fireEvent.click(linha)
        expect(onPickDate).toHaveBeenCalledWith('2026-08-14')
        expect(onClose).toHaveBeenCalled()
    })

    it('a média é a dos dias registrados, e a cobertura fica visível', async () => {
        abrir()
        // (2400 + 2000) / 2 dias registrados = 2200 — nunca dividido por 30.
        expect(await screen.findByText('2200')).toBeInTheDocument()
        expect(screen.getByText(/2 de 30 dias com lançamento/i)).toBeInTheDocument()
    })

    it('janela vazia diz que não há registro — sem inventar média', async () => {
        resposta.data = []
        abrir()
        expect(await screen.findByText(/nenhum dia registrado/i)).toBeInTheDocument()
        expect(screen.getByText(/0 de 30 dias com lançamento/i)).toBeInTheDocument()
    })

    /**
     * O supabase-js devolve a falha no RETORNO. Sem o ramo de erro, uma leitura
     * que falhou desenharia o mesmo estado vazio — a lista afirmaria que o
     * usuário nunca comeu.
     */
    it('erro de leitura NÃO vira "nunca comeu"', async () => {
        resposta.data = []
        resposta.error = { message: 'boom' }
        abrir()
        expect(await screen.findByText(/não consegui carregar/i)).toBeInTheDocument()
        expect(screen.queryByText(/nenhum dia registrado/i)).not.toBeInTheDocument()
    })

    /**
     * Visto no aparelho: a linha lia "Sex., 14 De Ago." — o `capitalize` do
     * Tailwind sobe TODA palavra, e o navegador de data logo acima escreve
     * "sex., 14 de ago.". Duas grafias da mesma data na mesma tela.
     */
    it('a data sobe só a primeira letra — "De Ago." não existe', async () => {
        abrir()
        const linha = await screen.findByText(/14 de ago/i)
        expect(linha.textContent).not.toMatch(/\sDe\s/)
        expect(linha.className, 'capitalize do Tailwind sobe toda palavra').not.toMatch(/capitalize/)
    })

    it('fechada, não renderiza nada', () => {
        const { container } = abrir({ open: false })
        expect(container.textContent).toBe('')
    })
})

/**
 * Compartilhar o PERÍODO — o passo 2 do histórico. O composer é o mesmo dos
 * modos refeição e dia (5 templates), só muda o conteúdo desenhado.
 */
describe('story do período', () => {
    it('o botão nomeia o período da janela', async () => {
        abrir()
        expect(await screen.findByRole('button', { name: /compartilhar mês/i })).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: /^7 dias$/i }))
        expect(await screen.findByRole('button', { name: /compartilhar semana/i })).toBeInTheDocument()
    })

    it('janela sem lançamento não deixa postar — média de nada é afirmação falsa', async () => {
        resposta.data = []
        abrir()
        const botao = await screen.findByRole('button', { name: /compartilhar/i })
        expect(botao).toBeDisabled()
    })

    it('com dias registrados, o botão libera', async () => {
        abrir()
        const botao = await screen.findByRole('button', { name: /compartilhar/i })
        expect(botao).not.toBeDisabled()
    })

    it('o composer recebe o resumo JÁ calculado, sem refazer a média', () => {
        const modal = readFileSync(join(__dirname, '..', 'NutritionHistoryModal.tsx'), 'utf8')
        expect(modal, 'duas contas para a mesma média é como nasce divergência')
            .toMatch(/periodToContent\(resumo,/)
        expect(modal).toMatch(/mode="period"/)
    })
})

describe('fiação na aba de nutrição', () => {
    const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8')

    it('o navegador de data abre o histórico', () => {
        const mixer = read('NutritionMixer.tsx')
        expect(mixer).toMatch(/onOpenHistory=\{/)
        expect(mixer, 'sem o modal montado o botão não leva a lugar nenhum')
            .toMatch(/<NutritionHistoryModal/)
    })

    it('tocar num dia da lista muda o dia da aba', () => {
        const mixer = read('NutritionMixer.tsx')
        const bloco = mixer.slice(mixer.indexOf('<NutritionHistoryModal'), mixer.indexOf('<NutritionHistoryModal') + 300)
        expect(bloco, 'a lista existe para navegar — sem isto ela é só leitura')
            .toMatch(/onPickDate=\{handleDateChange\}/)
    })

    it('a meta chega ao story do período', () => {
        const mixer = readFileSync(join(__dirname, '..', 'NutritionMixer.tsx'), 'utf8')
        const bloco = mixer.slice(mixer.indexOf('<NutritionHistoryModal'), mixer.indexOf('<NutritionHistoryModal') + 400)
        expect(bloco, 'sem a meta o story do período perde a referência do hero')
            .toMatch(/goals=\{safeGoals\}/)
    })

    it('o botão de histórico tem nome acessível', () => {
        const nav = read('DateNavigator.tsx')
        expect(nav).toMatch(/aria-label="Histórico de nutrição"/)
    })
})
