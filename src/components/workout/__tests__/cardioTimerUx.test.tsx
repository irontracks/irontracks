/**
 * Cardio/prancha em andamento — o que a tela mostra e o que o botão faz.
 *
 * INCIDENTE (dono, jul/2026): durante o cardio a tela mostrava "Cardio em
 * andamento" + Parar (vermelho) no card e "START ▶" (amarelo) na barra — dois
 * nomes opostos para o mesmo exercício. E o START da barra só fechava o
 * cronômetro: a série NÃO era gravada e o card ficava preso em andamento.
 * O tempo, que é o conteúdo do exercício, só existia num anel de 13px.
 *
 * INVARIANTES:
 *  1. O card mostra o tempo restante e a meta.
 *  2. No cardio/prancha o botão da barra CONCLUI, gravando o tempo real feito.
 *  3. Nada de AUTO (auto-start de descanso) nesses modos.
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RunningTimerCard } from '../RunningTimerCard'
import RestTimerOverlay from '../RestTimerOverlay'

vi.mock('@/lib/sounds', () => ({ playTimerFinishSound: vi.fn(), playTick: vi.fn() }))
vi.mock('@/lib/workout/restEndPush', () => ({ scheduleRestEndPush: vi.fn(), cancelRestEndPush: vi.fn() }))
vi.mock('@/hooks/useKeyboardInset', () => ({ useKeyboardInset: () => 0 }))
vi.mock('@/utils/platform', () => ({ isNativePlatform: () => false }))
vi.mock('@/utils/native/irontracksNative', () => ({
  addWidgetStartSetListener: () => () => {},
  cancelRestNotification: vi.fn(() => Promise.resolve()),
  checkPendingWidgetAction: vi.fn(() => Promise.resolve(null)),
  endRestLiveActivity: vi.fn(),
  requestNativeNotifications: vi.fn(() => Promise.resolve({ granted: false })),
  scheduleRestNotification: vi.fn(),
  startRestLiveActivity: vi.fn(),
  stopAlarmSound: vi.fn(),
  triggerHaptic: vi.fn(() => Promise.resolve()),
  updateRestLiveActivity: vi.fn(),
  updateWorkoutRestCountdown: vi.fn(),
}))

describe('Card do exercício cronometrado', () => {
  it('mostra o tempo restante e a meta', () => {
    render(
      <RunningTimerCard
        setIdx={0}
        label="Cardio"
        startedAtMs={Date.now() - 5 * 60 * 1000}
        targetSeconds={20 * 60}
        onStop={vi.fn()}
      />,
    )
    expect(screen.getByText('15:00')).toBeTruthy()
    expect(screen.getByText(/de 20:00/)).toBeTruthy()
    expect(screen.getByText('Parar')).toBeTruthy()
  })

  it('passou da meta: mostra o excedente, não um número negativo', () => {
    render(
      <RunningTimerCard
        setIdx={0}
        label="Prancha"
        startedAtMs={Date.now() - 70 * 1000}
        targetSeconds={60}
        onStop={vi.fn()}
      />,
    )
    expect(screen.getByText('+0:10')).toBeTruthy()
  })
})

describe('Barra do cronômetro em cardio/prancha', () => {
  const renderOverlay = (kind: 'cardio' | 'rest', onComplete = vi.fn(), onStart = vi.fn()) => {
    render(
      <RestTimerOverlay
        targetTime={Date.now() + 60_000}
        context={{ kind, key: '0-0', onComplete } as never}
        onFinish={vi.fn()}
        onStart={onStart}
        onClose={vi.fn()}
        settings={null}
        autoStartEnabled
      />,
    )
    return { onComplete, onStart }
  }

  beforeEach(() => vi.clearAllMocks())

  it('o botão diz CONCLUIR (não START) e não há AUTO', () => {
    renderOverlay('cardio')
    expect(screen.getByText('CONCLUIR ✓')).toBeTruthy()
    expect(screen.queryByText('START ▶')).toBeNull()
    expect(screen.queryByText('AUTO')).toBeNull()
  })

  it('concluir GRAVA a série com o tempo feito, em vez de só fechar o cronômetro', () => {
    const { onComplete, onStart } = renderOverlay('cardio')
    fireEvent.click(screen.getByText('CONCLUIR ✓'))
    expect(onComplete).toHaveBeenCalledTimes(1)
    const seconds = onComplete.mock.calls[0]?.[0] as number
    expect(seconds).toBeGreaterThan(0)
    // O caminho de descanso (que só fecha o timer) não pode ser usado aqui.
    expect(onStart).not.toHaveBeenCalled()
  })

  it('no descanso normal nada muda: START e AUTO seguem lá', () => {
    renderOverlay('rest')
    expect(screen.getByText('START ▶')).toBeTruthy()
    expect(screen.getByText('AUTO')).toBeTruthy()
  })
})
