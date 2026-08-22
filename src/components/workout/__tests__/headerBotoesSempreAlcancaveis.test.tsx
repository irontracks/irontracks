import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import WorkoutHeader from '@/components/workout/WorkoutHeader'

/**
 * A SAÍDA DO TREINO NÃO PODE DEPENDER DE CONCLUIR A SÉRIE (22/08/2026).
 *
 * O header escondia os botões de ação (`opacity-0 pointer-events-none`)
 * "durante a execução de uma série, para reduzir distração". O problema é que
 * `ui.activeExecution` nasce quando o usuário INICIA a próxima série pelo timer
 * de descanso e só é limpo quando AQUELA série é marcada como concluída
 * (`useActiveSession.handleUpdateSessionLog`). Quem inicia a série e não a
 * conclui — trocou de exercício, foi editar o treino, largou o aparelho —
 * fica com o header vazio pelo RESTO da sessão: sem Descartar, sem "…"
 * (Organizar / Cardio GPS / Convidar) e sem Editar treino.
 *
 * Foi assim que o dono reportou "perdemos os botões de cima" (print de 22/08,
 * 1/30 séries, 6:59 de treino) — nada tinha sido removido do código.
 *
 * Guard: com uma execução ativa, os três seguem VISÍVEIS e CLICÁVEIS.
 */
const ctx = {
  workout: { title: 'SEG · Upper B - Peito + Braços' },
  exercises: [{ id: 'a' }, { id: 'b' }],
  inviteOpen: false,
  setInviteOpen: vi.fn(),
  openFullEditor: vi.fn(),
  openOrganizeModal: vi.fn(),
  sendInvite: vi.fn(),
  alert: vi.fn(),
  completedSets: 1,
  totalSets: 30,
  progressPct: 3,
  session: { ui: { activeExecution: { key: '0-1', startedAtMs: 1_000 } } } as Record<string, unknown>,
  _exitOnBack: vi.fn(),
  openCardioGps: vi.fn(),
  confirm: vi.fn(async () => true),
  cancelWorkout: vi.fn(),
}

vi.mock('@/components/workout/WorkoutContext', () => ({
  useWorkoutContext: () => ctx,
}))
vi.mock('@/components/workout/WorkoutTimerContext', () => ({
  // ticker > startedAtMs = série "em execução" no critério do header
  useWorkoutTimer: () => ({
    ticker: 500_000,
    elapsedSeconds: 419,
    formatElapsed: (s: number) => String(s),
    isPaused: false,
    togglePause: vi.fn(),
  }),
}))
vi.mock('@/contexts/TeamWorkoutContext', () => ({
  useTeamWorkout: () => ({ teamSession: null, sessionPaused: false, pauseSession: vi.fn(), resumeSession: vi.fn() }),
}))
vi.mock('@/components/workout/HeartRateMonitor', () => ({ default: () => null }))
vi.mock('@/components/InviteManager', () => ({ default: () => null }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
  usePathname: () => '/dashboard',
}))

/** Sobe a árvore procurando quem apague o elemento da tela ou do toque. */
function ancestralQueEsconde(el: HTMLElement | null): HTMLElement | null {
  let node: HTMLElement | null = el
  while (node) {
    const cls = node.className
    const classes = typeof cls === 'string' ? cls : ''
    if (/\bopacity-0\b/.test(classes) || /\bpointer-events-none\b/.test(classes) || /\bhidden\b/.test(classes)) {
      return node
    }
    node = node.parentElement
  }
  return null
}

describe('header do treino ativo — com série em execução', () => {
  beforeEach(() => {
    ctx.session = { ui: { activeExecution: { key: '0-1', startedAtMs: 1_000 } } }
  })

  it('o X de descartar continua alcançável', () => {
    render(<WorkoutHeader />)
    const btn = screen.getByLabelText(/descartar treino/i) as HTMLElement
    expect(ancestralQueEsconde(btn), 'o botão está dentro de um bloco escondido').toBeNull()
  })

  it('o menu "…" (Organizar / Cardio GPS / Convidar) continua alcançável', () => {
    render(<WorkoutHeader />)
    const btn = screen.getByLabelText(/mais opções/i) as HTMLElement
    expect(ancestralQueEsconde(btn), 'o botão está dentro de um bloco escondido').toBeNull()
  })

  it('o botão de editar treino continua alcançável', () => {
    render(<WorkoutHeader />)
    const btn = screen.getByTitle(/editar treino/i) as HTMLElement
    expect(ancestralQueEsconde(btn), 'o botão está dentro de um bloco escondido').toBeNull()
  })

  it('sem execução ativa também aparecem (o guard não passa por acidente)', () => {
    ctx.session = { ui: { activeExecution: null } }
    render(<WorkoutHeader />)
    expect(ancestralQueEsconde(screen.getByLabelText(/descartar treino/i))).toBeNull()
  })
})
