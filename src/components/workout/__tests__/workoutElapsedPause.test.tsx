/**
 * Cronômetro do treino × pausa por background.
 *
 * INCIDENTE (dono, jul/2026): a Ilha Dinâmica marcava ~43 min e o app 35:56 na
 * MESMA sessão. Causa: o app descontava como "pausa" qualquer período em
 * background acima de 2 minutos — ou seja, os descansos feitos com a tela
 * bloqueada saíam do tempo de treino. Quem estava certo era a Live Activity.
 *
 * INVARIANTE: descanso (mesmo longo, com o app fora) CONTA como treino. Só o
 * abandono de verdade — o "esqueci o treino aberto" — vira pausa.
 */
import { render, screen, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { WorkoutTimerProvider, useWorkoutTimer, LONG_GAP_MS } from '../WorkoutTimerContext'

const Probe = () => {
  const { elapsedSeconds } = useWorkoutTimer()
  return <span data-testid="elapsed">{elapsedSeconds}</span>
}

const elapsed = () => Number(screen.getByTestId('elapsed').textContent)

const setHidden = (hidden: boolean) => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('Tempo de treino — o que conta como pausa', () => {
  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }) })
  afterEach(() => { vi.useRealTimers(); setHidden(false) })

  it('limiar é de abandono, não de descanso (nenhum descanso chega a 20 min)', () => {
    expect(LONG_GAP_MS).toBe(20 * 60 * 1000)
  })

  it('descanso de 5 min com o app fora CONTA como treino', () => {
    const start = Date.now() - 10 * 60 * 1000 // treino começou há 10 min
    render(<WorkoutTimerProvider startedAtMs={start}><Probe /></WorkoutTimerProvider>)

    act(() => { setHidden(true) })
    act(() => { vi.advanceTimersByTime(5 * 60 * 1000) })
    act(() => { setHidden(false) })
    act(() => { vi.advanceTimersByTime(1100) })

    // 10 min iniciais + 5 min de descanso ≈ 15 min, sem desconto.
    expect(elapsed()).toBeGreaterThanOrEqual(15 * 60)
    expect(elapsed()).toBeLessThan(15 * 60 + 10)
  })

  it('abandono de 40 min vira pausa e NÃO infla o tempo', () => {
    const start = Date.now() - 10 * 60 * 1000
    render(<WorkoutTimerProvider startedAtMs={start}><Probe /></WorkoutTimerProvider>)

    act(() => { setHidden(true) })
    act(() => { vi.advanceTimersByTime(40 * 60 * 1000) })
    act(() => { setHidden(false) })
    act(() => { vi.advanceTimersByTime(1100) })

    // Continua nos ~10 min de treino real — os 40 min fora não entram.
    expect(elapsed()).toBeLessThan(11 * 60)
  })

  it('sessão restaurada horas depois não conta o tempo em que o app esteve morto', () => {
    const now = Date.now()
    render(
      <WorkoutTimerProvider startedAtMs={now - 5 * 60 * 60 * 1000} lastActiveAtMs={now - 4 * 60 * 60 * 1000}>
        <Probe />
      </WorkoutTimerProvider>,
    )
    // 5h desde o início, 4h delas com o app morto → ~1h de treino.
    expect(elapsed()).toBeGreaterThan(59 * 60)
    expect(elapsed()).toBeLessThan(61 * 60)
  })
})
