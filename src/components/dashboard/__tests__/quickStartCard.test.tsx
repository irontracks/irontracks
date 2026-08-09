import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QuickStartCard } from '@/components/dashboard/QuickStartCard'
import type { DashboardWorkout } from '@/types/dashboard'

/**
 * "Treinar agora" — sprint 3 da auditoria de design, ago/2026.
 *
 * O caminho até levantar peso era: abrir → rolar → Iniciar → modal → check-in.
 * Cinco passos num app cuja razão de existir é treinar. Este card é o último
 * elo: a ação primária vira a primeira coisa visível, com o treino já escolhido.
 */

const treino = (title: string, extra: Partial<DashboardWorkout> = {}) =>
    ({ id: title, title, exercises: [{ sets: [{}, {}, {}] }], ...extra }) as unknown as DashboardWorkout

// Segunda-feira, para exercitar a escolha por dia do título.
const SEGUNDA = new Date(2026, 7, 10, 9, 0, 0)

describe('escolha do treino', () => {
    it('escolhe o treino de HOJE pelo dia no título', () => {
        vi.setSystemTime(SEGUNDA)
        render(
            <QuickStartCard
                workouts={[treino('B - puxar a (terça)'), treino('A - empurrar a (segunda)')]}
                onStartSession={() => { }}
            />,
        )
        expect(screen.getByText('A - empurrar a (segunda)')).toBeInTheDocument()
        expect(screen.getByText(/Treino de hoje/i)).toBeInTheDocument()
        vi.useRealTimers()
    })

    it('sem treino do dia, cai no primeiro e muda o rótulo', () => {
        vi.setSystemTime(new Date(2026, 7, 9, 9, 0, 0)) // domingo
        render(
            <QuickStartCard
                workouts={[treino('A - empurrar a (segunda)'), treino('B - puxar a (terça)')]}
                onStartSession={() => { }}
            />,
        )
        expect(screen.getByText('A - empurrar a (segunda)')).toBeInTheDocument()
        expect(screen.getByText(/Próximo treino/i)).toBeInTheDocument()
        vi.useRealTimers()
    })

    it('ignora treinos arquivados', () => {
        render(
            <QuickStartCard
                workouts={[treino('Arquivado', { archived_at: '2026-01-01' }), treino('Ativo')]}
                onStartSession={() => { }}
            />,
        )
        expect(screen.getByText('Ativo')).toBeInTheDocument()
        expect(screen.queryByText('Arquivado')).not.toBeInTheDocument()
    })
})

describe('quando NÃO aparecer', () => {
    it('some com treino em andamento', () => {
        const { container } = render(
            <QuickStartCard workouts={[treino('A')]} onStartSession={() => { }} hasActiveSession />,
        )
        expect(container).toBeEmptyDOMElement()
    })

    it('some sem treino nenhum', () => {
        const { container } = render(<QuickStartCard workouts={[]} onStartSession={() => { }} />)
        expect(container).toBeEmptyDOMElement()
    })
})

describe('ação', () => {
    it('um toque inicia o treino escolhido', () => {
        const iniciar = vi.fn()
        render(<QuickStartCard workouts={[treino('A - teste')]} onStartSession={iniciar} />)
        fireEvent.click(screen.getByRole('button', { name: /Treinar agora/i }))
        expect(iniciar).toHaveBeenCalledTimes(1)
        expect((iniciar.mock.calls[0][0] as DashboardWorkout).title).toBe('A - teste')
    })

    it('o duplo toque não dispara dois treinos', () => {
        const iniciar = vi.fn()
        render(<QuickStartCard workouts={[treino('A - teste')]} onStartSession={iniciar} />)
        const botao = screen.getByRole('button', { name: /Treinar agora/i })
        fireEvent.click(botao)
        fireEvent.click(botao)
        expect(iniciar).toHaveBeenCalledTimes(1)
    })
})

describe('posição no dashboard', () => {
    it('é renderizado ANTES do aviso de perfil', () => {
        const dash = readFileSync(join(__dirname, '..', 'StudentDashboard.tsx'), 'utf8')
        const idxQuick = dash.indexOf('<QuickStartCard')
        const idxAviso = dash.indexOf('<ProfileIncompleteBanner')
        expect(idxQuick).toBeGreaterThan(-1)
        expect(idxQuick, 'a ação primária vem antes do lembrete').toBeLessThan(idxAviso)
    })

    it('os painéis de dados ficam DEPOIS da lista de treinos', () => {
        const dash = readFileSync(join(__dirname, '..', 'StudentDashboard.tsx'), 'utf8')
        const idxLista = dash.indexOf('<WorkoutCard')
        const idxIronRank = dash.indexOf('<IronRankCard')
        expect(idxIronRank, 'Iron Rank antes da lista empurra os treinos para fora da dobra')
            .toBeGreaterThan(idxLista)
    })
})
