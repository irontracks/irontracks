import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import SessionDeloadBanner from '../SessionDeloadBanner'

/**
 * UI do CICLO de descarga — a semana, não a sessão.
 *
 * Origem: o dono aplicou descarga numa segunda dizendo que ia "até sexta"
 * (07/09/2026) e não havia onde guardar esse "até sexta". Cada sessão era um
 * evento isolado.
 */
const startDeloadCycle = vi.fn()
const endDeloadCycle = vi.fn()

let ctx: Record<string, unknown>
vi.mock('../WorkoutContext', () => ({ useWorkoutContext: () => ctx }))

const base = (extra: Record<string, unknown> = {}) => ({
  exercises: [{ name: 'Supino' }],
  autoLoadEnabled: true,
  sessionDeloadAlert: null,
  sessionDeloadModal: null,
  setSessionDeloadModal: () => {},
  applyDeloadToSession: vi.fn(),
  workoutDeloadEnabled: true,
  toggleWorkoutDeload: () => {},
  deloadCycleStatus: 'inactive',
  deloadCycleDaysRemaining: 0,
  startDeloadCycle,
  endDeloadCycle,
  ...extra,
})

beforeEach(() => {
  startDeloadCycle.mockClear()
  endDeloadCycle.mockClear()
  ctx = base()
})

describe('ciclo de descarga no banner', () => {
  it('sem ciclo, oferece iniciar e grava a duração escolhida', () => {
    render(<SessionDeloadBanner />)
    fireEvent.click(screen.getByRole('button', { name: /iniciar uma semana de descarga/i }))
    fireEvent.click(screen.getByRole('button', { name: /descarga de 5 dias/i }))
    expect(startDeloadCycle).toHaveBeenCalledWith(5)
  })

  it('em ciclo, mostra quantos dias faltam e deixa encerrar', () => {
    ctx = base({ deloadCycleStatus: 'active', deloadCycleDaysRemaining: 3 })
    render(<SessionDeloadBanner />)
    expect(screen.getByText(/faltam 3 dias/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /encerrar a semana de descarga/i }))
    expect(endDeloadCycle).toHaveBeenCalled()
  })

  it('no último dia avisa que é o último dia', () => {
    ctx = base({ deloadCycleStatus: 'ends_today', deloadCycleDaysRemaining: 1 })
    render(<SessionDeloadBanner />)
    expect(screen.getByText(/último dia/i)).toBeTruthy()
  })

  // GUARD DE CONTRATO. `deloadCycleStatus` ausente já produziu "em ciclo" aqui,
  // porque a checagem era `!== 'inactive'`. O app anunciaria uma semana de
  // descarga que não existe — e o dono leria as cargas do dia por essa lente.
  it('status ausente NÃO é ciclo', () => {
    ctx = base({ deloadCycleStatus: undefined, deloadCycleDaysRemaining: undefined })
    render(<SessionDeloadBanner />)
    expect(screen.queryByText(/faltam/i)).toBeNull()
    expect(screen.queryByText(/último dia/i)).toBeNull()
    expect(screen.getByRole('button', { name: /iniciar uma semana de descarga/i })).toBeTruthy()
  })

  // Fora do ciclo, a linha só existe onde o assunto descarga já está em tela.
  // O topo do treino é espaço nobre (auditoria de 06/09/2026).
  it('sem carga automática e sem ciclo, não ocupa o topo', () => {
    ctx = base({ autoLoadEnabled: false })
    const { container } = render(<SessionDeloadBanner />)
    expect(container).toBeEmptyDOMElement()
  })

  it('mas em ciclo aparece mesmo sem carga automática', () => {
    ctx = base({ autoLoadEnabled: false, deloadCycleStatus: 'active', deloadCycleDaysRemaining: 2 })
    render(<SessionDeloadBanner />)
    expect(screen.getByText(/faltam 2 dias/i)).toBeTruthy()
  })
})
