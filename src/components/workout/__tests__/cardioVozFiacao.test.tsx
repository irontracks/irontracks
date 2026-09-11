/**
 * A FIAÇÃO da voz do cardio.
 *
 * `vozDoCardio.ts` passa verde com o app mudo — ele só sabe formatar frases.
 * O que prova a feature é o componente CHAMAR a fala, no momento certo e com o
 * número certo. E o número certo é o do EXERCÍCIO INTEIRO: o caso do bloco 2
 * abaixo é a tradução literal do pedido do dono ("deveria ler o total somando
 * todos os blocos") e fica vermelho se alguém trocar o total pelo relógio do
 * bloco — que é o jeito natural de escrever isso errado.
 */
import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CardioSetInput } from '../CardioSetInput'

const mockFalar = vi.fn()
vi.mock('@/lib/voz', () => ({
  falar: (t: string) => { mockFalar(t); return true },
  calar: vi.fn(),
  vozDisponivel: () => true,
}))

const mockStartTimer = vi.fn()
const mockUpdateLog = vi.fn()
let logs: Record<string, Record<string, unknown>> = {}
let settings: Record<string, unknown> | null = null

vi.mock('../WorkoutContext', () => ({
  useWorkoutContext: () => ({
    getLog: (k: string) => logs[k] ?? {},
    updateLog: mockUpdateLog,
    startTimer: mockStartTimer,
    getPlannedSet: (_ex: unknown, idx: number) => (idx < 3 ? { durationSeconds: 600 } : null),
    setCollapsed: vi.fn(),
    settings,
    toggleCardioAutoChain: vi.fn(),
  }),
}))

const esteira = (setIdx: number) => ({
  ex: { name: 'Esteira', method: 'Cardio' },
  exIdx: 0,
  setIdx,
  setsCount: 3,
})

const falas = () => mockFalar.mock.calls.map((c) => String(c[0]))

describe('Voz do cardio', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-09-11T10:00:00-03:00'))
    mockFalar.mockReset()
    mockStartTimer.mockReset()
    mockUpdateLog.mockReset()
    logs = {}
    settings = { cardioVozIntervaloMin: 5 }
  })
  afterEach(() => { vi.useRealTimers() })

  const iniciarEAndar = (setIdx: number, minutos: number) => {
    render(<CardioSetInput {...esteira(setIdx)} />)
    fireEvent.click(screen.getByRole('button', { name: /^iniciar/i }))
    act(() => { vi.advanceTimersByTime(minutos * 60_000) })
  }

  it('anuncia o marco durante o primeiro bloco', () => {
    iniciarEAndar(0, 5)
    expect(falas()).toContain('5 minutos')
  })

  it('com a voz DESLIGADA não fala nada', () => {
    settings = { cardioVozIntervaloMin: 0 }
    iniciarEAndar(0, 12)
    expect(mockFalar).not.toHaveBeenCalled()
  })

  it('não repete o mesmo marco a cada tique', () => {
    iniciarEAndar(0, 9)
    expect(falas().filter((f) => f === '5 minutos')).toHaveLength(1)
  })

  it('⚠️ o bloco 2 CONTINUA a contagem do exercício — não recomeça do zero', () => {
    // Bloco 1 já gravado com 5 min. Andando mais 5 no bloco 2, o total é 10.
    logs = { '0-0': { done: true, durationSeconds: 300 } }
    iniciarEAndar(1, 5)

    expect(falas()).toContain('10 minutos')
    // O erro que este caso existe para pegar: narrar o relógio DO BLOCO faria a
    // voz dizer "5 minutos" de novo, já dito no bloco anterior.
    expect(falas()).not.toContain('5 minutos')
  })

  it('a série inteira de um cardio 5·10·15 sai 5·10·15·20·25·30', () => {
    logs = { '0-0': { done: true, durationSeconds: 300 }, '0-1': { done: true, durationSeconds: 600 } }
    iniciarEAndar(2, 15)
    expect(falas().filter((f) => f.endsWith('minutos')))
      .toEqual(['20 minutos', '25 minutos', '30 minutos'])
  })

  it('bloco que troca SOZINHO se anuncia — é o que paga o encadeamento', () => {
    logs = {
      '0-0': { done: true, durationSeconds: 300 },
      '0-1': { autoStartAtMs: Date.now() },
    }
    settings = { cardioVozIntervaloMin: 5, cardioAutoChain: true }
    render(<CardioSetInput {...esteira(1)} />)
    expect(falas()[0]).toMatch(/^Bloco 2\./)
  })

  it('quem toca em "Iniciar" NÃO ouve o anúncio do bloco — acabou de ler na tela', () => {
    render(<CardioSetInput {...esteira(1)} />)
    fireEvent.click(screen.getByRole('button', { name: /^iniciar/i }))
    expect(falas().some((f) => f.startsWith('Bloco'))).toBe(false)
  })
})
