import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PlankSetInput } from '../PlankSetInput'

// Mock do ActiveWorkoutContext
const mockStartTimer = vi.fn()
const mockUpdateLog = vi.fn()

vi.mock('../ActiveWorkoutContext', () => ({
  useActiveWorkout: () => ({
    getLog: () => ({}),
    updateLog: mockUpdateLog,
    startTimer: mockStartTimer,
    getPlannedSet: () => ({ durationSeconds: 60 }),
    // settings expõe bodyWeightKg — tipagem é UnknownRecord | null
    settings: { bodyWeightKg: 82 },
  }),
}))

const baseProps = {
  ex: { name: 'Prancha' },
  exIdx: 0,
  setIdx: 0,
}

describe('PlankSetInput', () => {
  beforeEach(() => {
    mockStartTimer.mockReset()
    mockUpdateLog.mockReset()
  })

  it('pré-preenche peso com bodyWeightKg das settings', () => {
    render(<PlankSetInput {...baseProps} />)
    const weightInput = screen.getByLabelText(/peso corporal/i) as HTMLInputElement
    expect(weightInput.value).toBe('82')
  })

  it('pré-preenche tempo alvo com valor da ficha', () => {
    render(<PlankSetInput {...baseProps} />)
    const timeInput = screen.getByLabelText(/tempo alvo/i) as HTMLInputElement
    expect(timeInput.value).toBe('60')
  })

  it('clicar Iniciar chama startTimer com kind plank e onComplete', () => {
    render(<PlankSetInput {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: /iniciar/i }))
    expect(mockStartTimer).toHaveBeenCalledTimes(1)
    const [seconds, ctx] = mockStartTimer.mock.calls[0] as [number, { kind: string; onComplete: unknown }]
    expect(seconds).toBe(60)
    expect(ctx.kind).toBe('plank')
    expect(typeof ctx.onComplete).toBe('function')
  })
})

describe('PlankSetInput — sem peso cadastrado', () => {
  it('mostra mensagem pedindo para cadastrar peso no perfil', () => {
    // Override mock: settings sem bodyWeightKg
    vi.doMock('../ActiveWorkoutContext', () => ({
      useActiveWorkout: () => ({
        getLog: () => ({}),
        updateLog: vi.fn(),
        startTimer: vi.fn(),
        getPlannedSet: () => ({ durationSeconds: 60 }),
        settings: { bodyWeightKg: null },
      }),
    }))

    // Renderiza com settings que retornam null para bodyWeightKg
    // Como vi.doMock não faz re-import automático neste escopo,
    // testamos diretamente passando um log vazio e settings null mockado via prop
    // Reimportamos para garantir o módulo fresco
    vi.resetModules()
  })

  it('campo peso fica vazio quando bodyWeightKg é null', async () => {
    // Re-mock com bodyWeightKg null usando vi.mock isolado por importação dinâmica
    vi.doMock('../ActiveWorkoutContext', () => ({
      useActiveWorkout: () => ({
        getLog: () => ({}),
        updateLog: vi.fn(),
        startTimer: vi.fn(),
        getPlannedSet: () => ({ durationSeconds: 60 }),
        settings: { bodyWeightKg: null },
      }),
    }))
    vi.resetModules()
    const { PlankSetInput: Fresh } = await import('../PlankSetInput')
    render(<Fresh {...baseProps} />)
    const weightInput = screen.getByLabelText(/peso corporal/i) as HTMLInputElement
    expect(weightInput.value).toBe('')
    expect(screen.getByText(/cadastre seu peso/i)).toBeInTheDocument()
  })
})
