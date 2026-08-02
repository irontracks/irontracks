import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CardioSetInput } from '../CardioSetInput'

// Mock do WorkoutContext (mesmo hook usado pelos outros set-renderers)
const mockStartTimer = vi.fn()
const mockUpdateLog = vi.fn()
let plannedSet: Record<string, unknown> | null = { durationSeconds: 1200 }

vi.mock('../WorkoutContext', () => ({
  useWorkoutContext: () => ({
    getLog: () => ({}),
    updateLog: mockUpdateLog,
    startTimer: mockStartTimer,
    getPlannedSet: () => plannedSet,
    setCollapsed: vi.fn(),
  }),
}))

const treadmillProps = { ex: { name: 'Esteira', method: 'Cardio' }, exIdx: 0, setIdx: 0 }
const bikeProps = { ex: { name: 'Bike', method: 'Cardio' }, exIdx: 0, setIdx: 0 }

describe('CardioSetInput', () => {
  beforeEach(() => {
    mockStartTimer.mockReset()
    mockUpdateLog.mockReset()
    plannedSet = { durationSeconds: 1200 }
  })

  it('mostra Tempo, Velocidade e Inclinação na esteira', () => {
    render(<CardioSetInput {...treadmillProps} />)
    expect(screen.getByLabelText(/tempo em minutos/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/velocidade em km\/h/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/inclinação/i)).toBeInTheDocument()
  })

  it('esconde a inclinação em cardio que não é esteira (bike)', () => {
    render(<CardioSetInput {...bikeProps} />)
    expect(screen.getByLabelText(/tempo em minutos/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/intensidade/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/inclinação/i)).not.toBeInTheDocument()
  })

  it('pré-preenche o tempo (min) a partir do durationSeconds da ficha', () => {
    render(<CardioSetInput {...treadmillProps} />)
    const minInput = screen.getByLabelText(/tempo em minutos/i) as HTMLInputElement
    expect(minInput.value).toBe('20') // 1200s → 20 min
  })

  it('mostra START quando há tempo alvo e dispara startTimer com kind cardio', () => {
    render(<CardioSetInput {...treadmillProps} />)
    fireEvent.click(screen.getByRole('button', { name: /iniciar/i }))
    expect(mockStartTimer).toHaveBeenCalledTimes(1)
    const [seconds, ctx] = mockStartTimer.mock.calls[0] as [number, { kind: string; onComplete: unknown }]
    expect(seconds).toBe(1200)
    expect(ctx.kind).toBe('cardio')
    expect(typeof ctx.onComplete).toBe('function')
  })

  it('START fica desabilitado sem tempo alvo', () => {
    plannedSet = null
    render(<CardioSetInput {...treadmillProps} />)
    const startBtn = screen.getByRole('button', { name: /iniciar/i }) as HTMLButtonElement
    expect(startBtn.disabled).toBe(true)
  })

  it('"Concluir sem cronômetro" grava a série com duração, velocidade e inclinação', () => {
    render(<CardioSetInput {...treadmillProps} />)
    fireEvent.change(screen.getByLabelText(/velocidade em km\/h/i), { target: { value: '8' } })
    fireEvent.change(screen.getByLabelText(/inclinação/i), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: /concluir sem cronômetro/i }))
    expect(mockUpdateLog).toHaveBeenCalledTimes(1)
    const [key, patch] = mockUpdateLog.mock.calls[0] as [string, Record<string, unknown>]
    expect(key).toBe('0-0')
    expect(patch.durationSeconds).toBe(1200)
    expect(patch.speed).toBe(8)
    expect(patch.incline).toBe(3)
    expect(patch.done).toBe(true)
  })

  it('não grava inclinação em cardio que não é esteira', () => {
    render(<CardioSetInput {...bikeProps} />)
    fireEvent.change(screen.getByLabelText(/intensidade/i), { target: { value: '12' } })
    fireEvent.click(screen.getByRole('button', { name: /concluir sem cronômetro/i }))
    const [, patch] = mockUpdateLog.mock.calls[0] as [string, Record<string, unknown>]
    expect(patch.incline).toBe(null)
    expect(patch.speed).toBe(12)
  })
})
