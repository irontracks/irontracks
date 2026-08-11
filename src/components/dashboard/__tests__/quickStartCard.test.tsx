import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect, vi, beforeEach } from 'vitest'
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

    /**
     * Ago/2026: depois de finalizar, o dashboard continuava oferecendo "Treinar
     * agora" como primeira coisa da tela. O convite é ruído para quem acabou de
     * terminar — a tela do pós-treino deve ficar limpa.
     */
    // Este caso já exigiu container VAZIO. O invariante que importava — não
    // empurrar mais treino para quem já treinou — continua valendo e está
    // assertado abaixo. O que mudou (11/08/2026) foi o que ocupa o espaço:
    // sumir deixava o topo da aba TREINOS órfão, e quem subia por gravidade era
    // o estado vazio da barra de stories. Agora o topo informa a conclusão.
    it('não oferece iniciar depois da sessão concluída hoje — mas o topo não fica órfão', () => {
        render(
            <QuickStartCard workouts={[treino('A')]} onStartSession={() => { }} trainedToday />,
        )
        expect(screen.queryByRole('button', { name: /Treinar agora/i })).not.toBeInTheDocument()
        expect(screen.getByText(/Treino concluído hoje/i)).toBeInTheDocument()
    })

    // jsdom mantém o localStorage entre casos do mesmo arquivo: sem isto, o
    // primeiro teste que dispensa faz o card do SEGUINTE nascer já oculto, e o
    // segundo passa a testar nada (ele falhava nos dois estados da mutação —
    // sinal clássico de guard que não exercita o caminho).
    beforeEach(() => {
        try { window.localStorage.removeItem('it.trainedCard.dismissed') } catch { }
    })

    it('o aviso de conclusão pode ser dispensado — e some na hora', () => {
        render(<QuickStartCard workouts={[treino('A')]} onStartSession={() => { }} trainedToday />)
        fireEvent.click(screen.getByRole('button', { name: /Dispensar aviso/i }))
        expect(screen.queryByText(/Treino concluído hoje/i)).not.toBeInTheDocument()
    })

    it('a dispensa vale só para HOJE — guarda o dia, não um booleano', () => {
        // Guardar `true` faria o card sumir para sempre e o topo voltar a ficar
        // órfão a partir do segundo dia.
        render(<QuickStartCard workouts={[treino('A')]} onStartSession={() => { }} trainedToday />)
        fireEvent.click(screen.getByRole('button', { name: /Dispensar aviso/i }))
        const salvo = window.localStorage.getItem('it.trainedCard.dismissed')
        expect(salvo).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })

    it('dispensa de ONTEM não esconde o card de hoje', () => {
        window.localStorage.setItem('it.trainedCard.dismissed', '2020-01-01')
        render(<QuickStartCard workouts={[treino('A')]} onStartSession={() => { }} trainedToday />)
        expect(screen.getByText(/Treino concluído hoje/i)).toBeInTheDocument()
        window.localStorage.removeItem('it.trainedCard.dismissed')
    })

    it('sem nenhum treino cadastrado, nem o estado de conclusão aparece', () => {
        // Quem não tem treino nunca treinou: afirmar conclusão seria mentira.
        const { container } = render(
            <QuickStartCard workouts={[]} onStartSession={() => { }} trainedToday />,
        )
        expect(container).toBeEmptyDOMElement()
    })

    it('continua aparecendo enquanto não treinou hoje', () => {
        render(<QuickStartCard workouts={[treino('A')]} onStartSession={() => { }} trainedToday={false} />)
        expect(screen.getByRole('button', { name: /Treinar agora/i })).toBeInTheDocument()
    })
})

describe('tocar no card abre o treino', () => {
    it('o corpo do card chama onQuickView com o treino escolhido', () => {
        const verTreino = vi.fn()
        render(
            <QuickStartCard workouts={[treino('A - teste')]} onStartSession={() => { }} onQuickView={verTreino} />,
        )
        fireEvent.click(screen.getByRole('button', { name: /Ver treino A - teste/i }))
        expect(verTreino).toHaveBeenCalledTimes(1)
        expect((verTreino.mock.calls[0][0] as DashboardWorkout).title).toBe('A - teste')
    })

    /**
     * Os dois botões são IRMÃOS, não aninhados: aninhado é HTML inválido e o
     * toque em "Treinar agora" borbulharia, abrindo a visualização por baixo do
     * treino que acabou de começar.
     */
    it('tocar em "Treinar agora" não abre a visualização', () => {
        const verTreino = vi.fn()
        const iniciar = vi.fn()
        render(
            <QuickStartCard workouts={[treino('A - teste')]} onStartSession={iniciar} onQuickView={verTreino} />,
        )
        fireEvent.click(screen.getByRole('button', { name: /Treinar agora/i }))
        expect(iniciar).toHaveBeenCalledTimes(1)
        expect(verTreino).not.toHaveBeenCalled()
    })

    it('sem onQuickView o corpo não vira botão morto', () => {
        render(<QuickStartCard workouts={[treino('A - teste')]} onStartSession={() => { }} />)
        expect(screen.queryByRole('button', { name: /Ver treino/i })).not.toBeInTheDocument()
        expect(screen.getByText('A - teste')).toBeInTheDocument()
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

    it('a pergunta de intenção vem DEPOIS da ação primária', () => {
        const dash = readFileSync(join(__dirname, '..', 'StudentDashboard.tsx'), 'utf8')
        const idxQuick = dash.indexOf('<QuickStartCard')
        const idxPrompt = dash.indexOf('props.restDayPrompt')
        expect(idxPrompt).toBeGreaterThan(-1)
        expect(idxPrompt, '"vai treinar hoje?" é administrativo — não abre a tela')
            .toBeGreaterThan(idxQuick)
    })

    /**
     * Fiação, não só as pontas: o card sabe abrir e sabe sumir, mas nada disso
     * chega ao usuário se o dashboard não passar as duas props. Foi assim que
     * uma correção de motor ficou verde em 198 testes sem estar ligada.
     */
    it('o dashboard liga o toque do card à visualização rápida', () => {
        const dash = readFileSync(join(__dirname, '..', 'StudentDashboard.tsx'), 'utf8')
        const bloco = dash.slice(dash.indexOf('<QuickStartCard'), dash.indexOf('<QuickStartCard') + 400)
        expect(bloco).toMatch(/onQuickView=\{props\.onQuickView\}/)
    })

    it('o dashboard alimenta o card com "já treinou hoje"', () => {
        const dash = readFileSync(join(__dirname, '..', 'StudentDashboard.tsx'), 'utf8')
        const bloco = dash.slice(dash.indexOf('<QuickStartCard'), dash.indexOf('<QuickStartCard') + 400)
        expect(bloco, 'sem esta prop o card nunca some depois do treino').toMatch(/trainedToday=\{/)
        expect(dash).toMatch(/useTrainedToday\(props\.currentUserId, props\.hasActiveSession\)/)
    })

    it('os painéis de dados ficam DEPOIS da lista de treinos', () => {
        const dash = readFileSync(join(__dirname, '..', 'StudentDashboard.tsx'), 'utf8')
        const idxLista = dash.indexOf('<WorkoutCard')
        const idxIronRank = dash.indexOf('<IronRankCard')
        expect(idxIronRank, 'Iron Rank antes da lista empurra os treinos para fora da dobra')
            .toBeGreaterThan(idxLista)
    })
})
