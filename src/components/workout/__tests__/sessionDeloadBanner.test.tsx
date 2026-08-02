import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import SessionDeloadBanner from '../SessionDeloadBanner'

/**
 * Guard da descarga (deload) no escopo do TREINO.
 *
 * A feature existia por exercício e nunca foi usada — 0 de 547 sessões
 * concluídas. A aposta desta mudança é que o gargalo era a fricção: um aviso por
 * card, N decisões. Aqui é UMA decisão, com opt-out por exercício. Estes testes
 * travam o comportamento que sustenta essa aposta.
 */

const applyDeloadToSession = vi.fn(async () => { })
let ctx: Record<string, unknown> = {}
vi.mock('../WorkoutContext', () => ({ useWorkoutContext: () => ctx }))

const EXERCICIOS = [
  { name: 'Supino reto' },
  { name: 'Remada curvada' },
  { name: 'Agachamento' },
]

/** Reproduz o setSessionDeloadModal do hook (estado controlado pelo contexto). */
const montarCtx = (alerta: Record<string, unknown> | null) => {
  const c: Record<string, unknown> = {
    exercises: EXERCICIOS,
    autoLoadEnabled: false,
    sessionDeloadAlert: alerta,
    sessionDeloadModal: null,
    applyDeloadToSession,
    setSessionDeloadModal: (v: unknown) => { c.sessionDeloadModal = v; rerender?.() },
  }
  return c
}
let rerender: (() => void) | null = null

const ALERTA = { exIdxs: [0, 2], status: 'stagnation' as const, suggestedPct: 0.15, itemsCount: 5 }

beforeEach(() => {
  applyDeloadToSession.mockClear()
  ctx = montarCtx(ALERTA)
  rerender = null
})

const renderBanner = () => {
  const utils = render(<SessionDeloadBanner />)
  rerender = () => utils.rerender(<SessionDeloadBanner />)
  return utils
}

describe('SessionDeloadBanner', () => {
  it('com a carga automática ligada mostra o controle ÚNICO do treino', () => {
    // Invariante SUBSTITUÍDO em ago/2026 por decisão do dono ("deload é por
    // treino, não por exercício"). Antes o banner sumia aqui e o liga/desliga
    // vivia em cada card — oito botões para uma decisão só, chaveados por nome
    // de exercício (desligar o Supino num treino desligava em todos).
    // O modal manual continua aposentado com autoLoad ligado (#568); o que
    // aparece agora é só o consentimento do treino.
    ctx = montarCtx(ALERTA)
    ;(ctx as Record<string, unknown>).autoLoadEnabled = true
    ;(ctx as Record<string, unknown>).workoutDeloadEnabled = true
    ;(ctx as Record<string, unknown>).toggleWorkoutDeload = () => { }
    const { container, getByRole } = renderBanner()
    expect(container).not.toBeEmptyDOMElement()
    expect(getByRole('button', { name: /descarga do treino/i })).toBeTruthy()
    // e NÃO oferece a aplicação manual em bloco por cima do motor
    expect(container.textContent || '').not.toMatch(/Reduzir \d+% no treino/)
  })

  it('não renderiza nada sem alerta de sessão', () => {
    ctx = montarCtx(null)
    const { container } = renderBanner()
    expect(container).toBeEmptyDOMElement()
  })

  it('anuncia quantos exercícios e a redução proposta', () => {
    renderBanner()
    expect(screen.getByText(/2 exercícios deste treino/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Reduzir 15% no treino de hoje/i })).toBeTruthy()
  })

  it('regressão fala em carga que caiu, não em falta de progresso', () => {
    ctx = montarCtx({ ...ALERTA, status: 'overtraining', suggestedPct: 0.22 })
    renderBanner()
    expect(screen.getByText(/carga caiu/i)).toBeTruthy()
  })

  it('abre o modal com TODOS os exercícios sinalizados já marcados', () => {
    renderBanner()
    fireEvent.click(screen.getByRole('button', { name: /Reduzir 15%/i }))
    expect(screen.getByText('Descarga do treino')).toBeTruthy()
    expect(screen.getByText('Supino reto')).toBeTruthy()
    expect(screen.getByText('Agachamento')).toBeTruthy()
    // Só os sinalizados entram — o exercício 1 não estava em exIdxs.
    expect(screen.queryByText('Remada curvada')).toBeNull()
    expect(screen.getByRole('button', { name: /Aplicar em 2/i })).toBeTruthy()
  })

  it('opt-out: desmarcar um exercício tira ele da aplicação', async () => {
    renderBanner()
    fireEvent.click(screen.getByRole('button', { name: /Reduzir 15%/i }))
    fireEvent.click(screen.getByText('Supino reto'))
    expect(screen.getByRole('button', { name: /Aplicar em 1/i })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Aplicar em 1/i }))
    await waitFor(() => expect(applyDeloadToSession).toHaveBeenCalledWith([2]))
  })

  it('não deixa aplicar com nenhum exercício marcado', () => {
    renderBanner()
    fireEvent.click(screen.getByRole('button', { name: /Reduzir 15%/i }))
    fireEvent.click(screen.getByText('Supino reto'))
    fireEvent.click(screen.getByText('Agachamento'))
    const botao = screen.getByRole('button', { name: /Aplicar em 0/i }) as HTMLButtonElement
    expect(botao.disabled).toBe(true)
    fireEvent.click(botao)
    expect(applyDeloadToSession).not.toHaveBeenCalled()
  })

  it('aplica em todos quando nada é desmarcado', async () => {
    renderBanner()
    fireEvent.click(screen.getByRole('button', { name: /Reduzir 15%/i }))
    fireEvent.click(screen.getByRole('button', { name: /Aplicar em 2/i }))
    await waitFor(() => expect(applyDeloadToSession).toHaveBeenCalledWith([0, 2]))
  })

  it('dispensar esconde o banner sem aplicar nada', () => {
    renderBanner()
    fireEvent.click(screen.getByRole('button', { name: /Dispensar/i }))
    expect(screen.queryByText(/Reduzir 15%/i)).toBeNull()
    expect(applyDeloadToSession).not.toHaveBeenCalled()
  })

  it('cancelar fecha o modal sem aplicar', () => {
    renderBanner()
    fireEvent.click(screen.getByRole('button', { name: /Reduzir 15%/i }))
    fireEvent.click(screen.getByRole('button', { name: /^Cancelar$/i }))
    expect(applyDeloadToSession).not.toHaveBeenCalled()
  })
})
