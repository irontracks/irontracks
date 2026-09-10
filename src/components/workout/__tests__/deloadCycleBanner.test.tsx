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
  endDeloadCycle,
  ...extra,
})

beforeEach(() => {
  endDeloadCycle.mockClear()
  ctx = base()
})

describe('ciclo de descarga no banner', () => {
  // O INICIAR não mora mais aqui — foi para o menu "…" do header (ver
  // `deloadCycleMenu.test.tsx`). Este banner só mostra ciclo EM ANDAMENTO.
  it('sem ciclo, o banner não ocupa o topo', () => {
    const { container } = render(<SessionDeloadBanner />)
    expect(container.textContent || '').not.toMatch(/semana de deload/i)
  })

  it('em ciclo, mostra quantos dias faltam e deixa encerrar', () => {
    ctx = base({ deloadCycleStatus: 'active', deloadCycleDaysRemaining: 3 })
    render(<SessionDeloadBanner />)
    expect(screen.getByText(/faltam 3 dias/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /encerrar a semana de deload/i }))
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
  })

  // GUARD DA CORREÇÃO DE 10/09/2026. A condição era `emCiclo || autoLoadEnabled`.
  // O dono treina com a carga automática DESLIGADA: sem ciclo e sem autoload, os
  // dois lados eram falsos, a linha sumia e o "Iniciar" — que vivia aqui — ficava
  // INALCANÇÁVEL. Para começar um ciclo era preciso já ter um.
  //
  // Hoje a faixa depende SÓ do ciclo, e por isso a carga automática não muda nada
  // sobre ela: ligada ou desligada, o que decide é haver ciclo.
  it('a carga automática não decide mais se o ciclo aparece', () => {
    for (const autoLoadEnabled of [true, false]) {
      ctx = base({ autoLoadEnabled, deloadCycleStatus: 'active', deloadCycleDaysRemaining: 2 })
      const { unmount } = render(<SessionDeloadBanner />)
      expect(screen.getByText(/faltam 2 dias/i)).toBeTruthy()
      unmount()

      ctx = base({ autoLoadEnabled, deloadCycleStatus: 'inactive' })
      const { container, unmount: u2 } = render(<SessionDeloadBanner />)
      expect(container.textContent || '').not.toMatch(/semana de deload/i)
      u2()
    }
  })

  it('mas em ciclo aparece mesmo sem carga automática', () => {
    ctx = base({ autoLoadEnabled: false, deloadCycleStatus: 'active', deloadCycleDaysRemaining: 2 })
    render(<SessionDeloadBanner />)
    expect(screen.getByText(/faltam 2 dias/i)).toBeTruthy()
  })
})
