import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import TreinoPausado from '../TreinoPausado'
import { contarConclusoes } from '@/lib/workout/retomarAoConcluir'

/**
 * Pedido do dono (30/09/2026): pausado, o sinal era um botão de 24px — ele
 * seguia treinando sem perceber e o tempo ficava congelado. Agora há uma faixa
 * bem visível, e concluir uma série com o treino pausado retoma sozinho.
 */
const timer = { isPaused: false, togglePause: vi.fn() }
let logs: Record<string, unknown> = {}
const team = { teamSession: null as { id: string } | null, sessionPaused: false, resumeSession: vi.fn() }

vi.mock('../WorkoutTimerContext', () => ({ useWorkoutTimer: () => timer }))
vi.mock('../WorkoutContext', () => ({ useWorkoutLogs: () => logs }))
vi.mock('@/contexts/TeamWorkoutContext', () => ({ useTeamWorkout: () => team }))

beforeEach(() => {
  timer.isPaused = false
  timer.togglePause.mockClear()
  team.teamSession = null
  team.sessionPaused = false
  team.resumeSession.mockClear()
  logs = { '0-0': { done: true } }
})

describe('faixa de treino pausado', () => {
  it('sem pausa não mostra nada', () => {
    render(<TreinoPausado />)
    expect(screen.queryByRole('button', { name: /treino pausado/i })).toBeNull()
  })

  it('pausado mostra a faixa, e tocar nela retoma', () => {
    timer.isPaused = true
    render(<TreinoPausado />)
    fireEvent.click(screen.getByRole('button', { name: /treino pausado/i }))
    expect(timer.togglePause).toHaveBeenCalledTimes(1)
  })
})

describe('concluir série com o treino pausado retoma', () => {
  it('uma conclusão nova retoma o cronômetro', () => {
    timer.isPaused = true
    const { rerender } = render(<TreinoPausado />)
    logs = { '0-0': { done: true }, '0-1': { done: true } }
    rerender(<TreinoPausado />)
    expect(timer.togglePause).toHaveBeenCalledTimes(1)
  })

  it('concluir UM lado do unilateral também retoma', () => {
    timer.isPaused = true
    const { rerender } = render(<TreinoPausado />)
    logs = { '0-0': { done: true }, '0-1': { L_done: true } }
    rerender(<TreinoPausado />)
    expect(timer.togglePause).toHaveBeenCalledTimes(1)
  })

  it('desmarcar série NÃO retoma', () => {
    timer.isPaused = true
    const { rerender } = render(<TreinoPausado />)
    logs = { '0-0': { done: false } }
    rerender(<TreinoPausado />)
    expect(timer.togglePause).not.toHaveBeenCalled()
  })

  it('abrir a tela com séries já concluídas não conta como conclusão', () => {
    timer.isPaused = true
    render(<TreinoPausado />)
    expect(timer.togglePause).not.toHaveBeenCalled()
  })

  it('sem pausa, concluir não mexe no cronômetro', () => {
    const { rerender } = render(<TreinoPausado />)
    logs = { '0-0': { done: true }, '0-1': { done: true } }
    rerender(<TreinoPausado />)
    expect(timer.togglePause).not.toHaveBeenCalled()
  })

  it('em treino em dupla, retoma a sessão do time', () => {
    team.teamSession = { id: 's1' }
    team.sessionPaused = true
    const { rerender } = render(<TreinoPausado />)
    logs = { '0-0': { done: true }, '0-1': { done: true } }
    rerender(<TreinoPausado />)
    expect(team.resumeSession).toHaveBeenCalledTimes(1)
    expect(timer.togglePause).not.toHaveBeenCalled()
  })
})

describe('contarConclusoes', () => {
  it('conta série e cada lado', () => {
    expect(contarConclusoes({ a: { done: true, L_done: true, R_done: true }, b: { done: false }, c: null })).toBe(3)
    expect(contarConclusoes(null)).toBe(0)
  })
})
