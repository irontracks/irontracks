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
  // A dispensa agora persiste em localStorage (chave = treino + dia), por
  // pedido do dono — o card não pode reaparecer a cada remontagem. Sem
  // limpar aqui, um teste que dispensa "vaza" a marca para os seguintes,
  // que então nasceriam já dispensados.
  try { window.localStorage.clear() } catch { /* jsdom sempre tem localStorage */ }
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
  // ⚠️ O toggle "Descarga do treino: Ligada/Desligada" e o gatilho manual
  // ("Aplicar descarga agora") SAÍRAM deste componente em 19/09/2026 — foram
  // para o menu "…" do WorkoutHeader (pedido do dono: a linha permanente no
  // topo do treino "aparecendo toda hora" incomodava). Guard de fiação em
  // deloadPerExerciseWiring.test.ts; este arquivo cobre só o que continua
  // aqui — a sugestão automática e o ciclo de semana.

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

  it('lista o TREINO INTEIRO, com os sinalizados já marcados', () => {
    // Mudou em 07/09/2026. O modal listava só `exIdxs` (os exercícios que o motor
    // acusou), e não havia como alcançar os demais: descarga é decisão sistêmica,
    // e o que está progredindo é justamente o que mais acumula fadiga. No treino
    // do dono isso deixou Remada curvada e Elevação lateral em carga cheia.
    renderBanner()
    fireEvent.click(screen.getByRole('button', { name: /Reduzir 15%/i }))
    expect(screen.getByText('Descarga do treino')).toBeTruthy()
    expect(screen.getByText('Supino reto')).toBeTruthy()
    expect(screen.getByText('Agachamento')).toBeTruthy()
    expect(screen.getByText('Remada curvada')).toBeTruthy()
    // …mas só os sinalizados nascem marcados, e o diagnóstico continua visível.
    expect(screen.getByRole('button', { name: /Aplicar em 2/i })).toBeTruthy()
    // Texto EXATO do selo. O regex /sem progresso/i casava também com a frase do
    // banner ("2 exercícios deste treino estão sem progresso…") e contava 3.
    expect(screen.getAllByText('Sem progresso')).toHaveLength(2)
  })

  it('marcar todos alcança o exercício que o motor não sinalizou', async () => {
    renderBanner()
    fireEvent.click(screen.getByRole('button', { name: /Reduzir 15%/i }))
    fireEvent.click(screen.getByRole('button', { name: /Marcar todos/i }))
    fireEvent.click(screen.getByRole('button', { name: /Aplicar em 3/i }))
    await waitFor(() => expect(applyDeloadToSession).toHaveBeenCalledWith([0, 1, 2], 0.15))
  })

  it('opt-out: desmarcar um exercício tira ele da aplicação', async () => {
    renderBanner()
    fireEvent.click(screen.getByRole('button', { name: /Reduzir 15%/i }))
    fireEvent.click(screen.getByText('Supino reto'))
    expect(screen.getByRole('button', { name: /Aplicar em 1/i })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Aplicar em 1/i }))
    // A porcentagem viaja junto desde ago/2026: a redução é recalculada por
    // exercício lá dentro, então a chamada sem ela aplicaria o diagnóstico e
    // ignoraria a escolha do usuário.
    await waitFor(() => expect(applyDeloadToSession).toHaveBeenCalledWith([2], 0.15))
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
    await waitFor(() => expect(applyDeloadToSession).toHaveBeenCalledWith([0, 2], 0.15))
  })

  it('o atalho escolhido substitui o sugerido — no botão E na aplicação', () => {
    // O caso que motivou a mudança: o motor sugere, o atleta discorda. Se a
    // escolha ficasse só na aparência do botão, o peso cairia o do diagnóstico.
    renderBanner()
    fireEvent.click(screen.getByRole('button', { name: /^30%/ }))
    expect(screen.getByRole('button', { name: /Reduzir 30%/i })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Reduzir 30%/i }))
    fireEvent.click(screen.getByRole('button', { name: /Aplicar em 2/i }))
    return waitFor(() => expect(applyDeloadToSession).toHaveBeenCalledWith([0, 2], 0.3))
  })

  it('o sugerido pelo motor continua acessível entre os atalhos', () => {
    renderBanner()
    fireEvent.click(screen.getByRole('button', { name: /^30%/ }))
    fireEvent.click(screen.getByRole('button', { name: /^15%/ }))
    expect(screen.getByRole('button', { name: /Reduzir 15%/i })).toBeTruthy()
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
