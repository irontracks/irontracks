/**
 * A FIAÇÃO do encadeamento de blocos de cardio.
 *
 * `cardioChain.ts` passa verde sozinho com o botão morto — é o jeito nº 3 da
 * lista de guards falsos deste repo ("cobrindo as pontas e não a fiação"). O que
 * faz a feature existir é o componente CARIMBAR o próximo bloco ao concluir um,
 * e AGIR sobre o carimbo que recebeu. É isso que estes casos exercitam, pela
 * tela, com o contexto de treino mockado.
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CardioSetInput } from '../CardioSetInput'

const mockStartTimer = vi.fn()
const mockUpdateLog = vi.fn()
const mockToggleAutoChain = vi.fn()

let logs: Record<string, Record<string, unknown>> = {}
let settings: Record<string, unknown> | null = null
/** Quantos blocos o exercício tem (define se existe um "próximo"). */
let totalDeBlocos = 3

vi.mock('../WorkoutContext', () => ({
  useWorkoutContext: () => ({
    getLog: (k: string) => logs[k] ?? {},
    updateLog: mockUpdateLog,
    startTimer: mockStartTimer,
    getPlannedSet: (_ex: unknown, idx: number) =>
      idx < totalDeBlocos ? { durationSeconds: 600 } : null,
    setCollapsed: vi.fn(),
    settings,
    toggleCardioAutoChain: mockToggleAutoChain,
  }),
}))

const esteira = (setIdx: number, restTime = 0) => ({
  ex: { name: 'Esteira', method: 'Cardio', restTime },
  exIdx: 0,
  setIdx,
  setsCount: totalDeBlocos,
})

/** Último patch escrito na chave pedida. */
const patchDe = (key: string) => {
  const calls = mockUpdateLog.mock.calls.filter((c) => c[0] === key)
  return calls.length ? (calls[calls.length - 1][1] as Record<string, unknown>) : null
}

describe('Encadeamento de blocos de cardio', () => {
  beforeEach(() => {
    mockStartTimer.mockReset()
    mockUpdateLog.mockReset()
    mockToggleAutoChain.mockReset()
    logs = {}
    settings = { cardioAutoChain: true }
    totalDeBlocos = 3
  })

  it('concluir um bloco CARIMBA a hora de começar do próximo', () => {
    render(<CardioSetInput {...esteira(0)} />)
    fireEvent.click(screen.getByRole('button', { name: /concluir sem cron/i }))

    expect(patchDe('0-0')).toMatchObject({ done: true })
    const proximo = patchDe('0-1')
    expect(proximo).not.toBeNull()
    expect(Number(proximo?.autoStartAtMs)).toBeGreaterThan(0)
  })

  it('com descanso configurado, o carimbo do próximo é DEPOIS do descanso', () => {
    render(<CardioSetInput {...esteira(0, 60)} />)
    const antes = Date.now()
    fireEvent.click(screen.getByRole('button', { name: /concluir sem cron/i }))

    const carimbo = Number(patchDe('0-1')?.autoStartAtMs)
    // 60 s de descanso: o próximo não pode começar junto com a conclusão.
    expect(carimbo).toBeGreaterThanOrEqual(antes + 60_000)
  })

  it('com o encadeamento DESLIGADO não carimba nada — o interruptor manda', () => {
    settings = { cardioAutoChain: false }
    render(<CardioSetInput {...esteira(0)} />)
    fireEvent.click(screen.getByRole('button', { name: /concluir sem cron/i }))

    expect(patchDe('0-0')).toMatchObject({ done: true })
    expect(patchDe('0-1')).toBeNull()
  })

  it('no ÚLTIMO bloco não carimba ninguém (não inventa uma série que não existe)', () => {
    totalDeBlocos = 1
    render(<CardioSetInput {...esteira(0)} />)
    fireEvent.click(screen.getByRole('button', { name: /concluir sem cron/i }))

    expect(patchDe('0-1')).toBeNull()
  })

  it('recebeu o carimbo e a hora chegou: arranca sozinho, contando desde o carimbo', () => {
    const carimbo = Date.now() - 30_000 // começou 30 s atrás
    logs = { '0-1': { autoStartAtMs: carimbo } }
    render(<CardioSetInput {...esteira(1)} />)

    // Não está mais oferecendo "Iniciar": o cronômetro já está rodando.
    expect(screen.queryByRole('button', { name: /^iniciar/i })).toBeNull()
    expect(screen.getByText(/em andamento/i)).toBeTruthy()
    expect(mockStartTimer).toHaveBeenCalledTimes(1)
    const [segundos, ctx] = mockStartTimer.mock.calls[0] as [number, { kind: string }]
    expect(ctx.kind).toBe('cardio')
    // 600 s de meta menos os 30 s já corridos — sem isso cada bloco esticaria.
    expect(segundos).toBeGreaterThan(560)
    expect(segundos).toBeLessThanOrEqual(571)
  })

  it('ainda não é a vez dele: fica quieto, sem ligar cronômetro nenhum', () => {
    logs = { '0-1': { autoStartAtMs: Date.now() + 60_000 } }
    render(<CardioSetInput {...esteira(1)} />)

    expect(mockStartTimer).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /^iniciar/i })).toBeTruthy()
  })

  it('o app dormiu e o bloco terminou: grava sozinho e DIZ que foi deduzido', () => {
    // Carimbado para 11 min atrás, meta de 10 min → terminou 1 min atrás.
    logs = { '0-1': { autoStartAtMs: Date.now() - 11 * 60_000 } }
    render(<CardioSetInput {...esteira(1)} />)

    const patch = patchDe('0-1')
    expect(patch).toMatchObject({ done: true, durationSeconds: 600, autoChainReconstruido: true })
    // E segue a cadeia: o bloco 3 recebe a vez.
    expect(Number(patchDe('0-2')?.autoStartAtMs)).toBeGreaterThan(0)
  })

  it('bloco reconstruído mostra o aviso de que a tela estava desligada', () => {
    logs = { '0-1': { done: true, durationSeconds: 600, autoChainReconstruido: true } }
    render(<CardioSetInput {...esteira(1)} />)
    expect(screen.getByText(/tela estava desligada/i)).toBeTruthy()
  })

  it('parado tempo demais: NÃO grava, avisa e devolve a decisão ao usuário', () => {
    // Meta de 10 min carimbada para 1 hora atrás: muito além do limite.
    logs = { '0-1': { autoStartAtMs: Date.now() - 60 * 60_000 } }
    render(<CardioSetInput {...esteira(1)} />)

    expect(patchDe('0-1')).toBeNull()
    expect(mockStartTimer).not.toHaveBeenCalled()
    expect(screen.getByText(/parado tempo demais/i)).toBeTruthy()
  })

  it('o atalho de ligar/desligar só aparece quando existe um próximo bloco', () => {
    const { unmount } = render(<CardioSetInput {...esteira(0)} />)
    expect(screen.getByRole('button', { name: /blocos em sequência|encadear blocos/i })).toBeTruthy()
    unmount()

    totalDeBlocos = 1
    render(<CardioSetInput {...esteira(0)} />)
    expect(screen.queryByRole('button', { name: /blocos em sequência|encadear blocos/i })).toBeNull()
  })

  it('o atalho persiste a preferência (não vira estado solto da tela)', () => {
    settings = { cardioAutoChain: false }
    render(<CardioSetInput {...esteira(0)} />)
    fireEvent.click(screen.getByRole('button', { name: /encadear blocos/i }))
    expect(mockToggleAutoChain).toHaveBeenCalledWith(true)
  })
})
