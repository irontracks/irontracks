/**
 * Descanso que venceu com o app FECHADO.
 *
 * SINTOMA (dono, jul/2026): fechar o app durante o intervalo, sem ter apertado
 * START, e reabrir — o app voltava SEM a barra de descanso, ou seja, como se o
 * START já tivesse sido dado. O botão que marca o início real da série sumia.
 *
 * CAUSA: `sanitizeRestoredSession` descartava `timerTargetTime`/`timerContext`
 * quando o alvo estava no passado (proteção contra abrir direto no flash verde
 * "BORA!" com o contador de atraso correndo).
 *
 * INVARIANTE: o timer é PRESERVADO e marcado como `restoredExpired` — a barra
 * com START volta, mas em modo silencioso (sem flash, sem alarme, sem
 * auto-advance). Quem decide começar a série continua sendo o usuário.
 */
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { sanitizeRestoredSession } from '../useSessionSync'
import RestTimerOverlay from '@/components/workout/RestTimerOverlay'

vi.mock('@/lib/sounds', () => ({ playTimerFinishSound: vi.fn(), playTick: vi.fn() }))
vi.mock('@/lib/workout/restEndPush', () => ({ scheduleRestEndPush: vi.fn(), cancelRestEndPush: vi.fn() }))
vi.mock('@/hooks/useKeyboardInset', () => ({ useKeyboardInset: () => 0 }))
vi.mock('@/utils/platform', () => ({ isNativePlatform: () => false }))

const native = {
  scheduleRestNotification: vi.fn(),
  startRestLiveActivity: vi.fn(),
  updateWorkoutRestCountdown: vi.fn(),
}
vi.mock('@/utils/native/irontracksNative', () => ({
  addWidgetStartSetListener: () => () => {},
  cancelRestNotification: vi.fn(() => Promise.resolve()),
  checkPendingWidgetAction: vi.fn(() => Promise.resolve(null)),
  endRestLiveActivity: vi.fn(),
  requestNativeNotifications: vi.fn(() => Promise.resolve({ granted: false })),
  scheduleRestNotification: (...a: unknown[]) => native.scheduleRestNotification(...a),
  startRestLiveActivity: (...a: unknown[]) => native.startRestLiveActivity(...a),
  stopAlarmSound: vi.fn(),
  triggerHaptic: vi.fn(() => Promise.resolve()),
  updateRestLiveActivity: vi.fn(),
  updateWorkoutRestCountdown: (...a: unknown[]) => native.updateWorkoutRestCountdown(...a),
}))

describe('sanitizeRestoredSession', () => {
  it('preserva o descanso vencido e marca restoredExpired', () => {
    const target = Date.now() - 60_000
    const out = sanitizeRestoredSession({ timerTargetTime: target, timerContext: { kind: 'rest', key: '0-1' } })
    expect(out.timerTargetTime).toBe(target)
    expect(out.timerContext).toMatchObject({ kind: 'rest', key: '0-1', restoredExpired: true, restoredExpiredAtMs: target })
  })

  it('descanso ainda correndo volta intacto, sem marca', () => {
    const target = Date.now() + 60_000
    const out = sanitizeRestoredSession({ timerTargetTime: target, timerContext: { kind: 'rest' } })
    expect(out.timerTargetTime).toBe(target)
    expect(out.timerContext).toEqual({ kind: 'rest' })
  })

  it('sessão sem timer passa reta', () => {
    const out = sanitizeRestoredSession({ timerTargetTime: null, timerContext: null })
    expect(out.timerTargetTime).toBeNull()
    expect(out.timerContext).toBeNull()
  })
})

describe('RestTimerOverlay restaurado vencido', () => {
  beforeEach(() => {
    native.scheduleRestNotification.mockClear()
    native.startRestLiveActivity.mockClear()
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })
  afterEach(() => vi.useRealTimers())

  const renderRestored = (onStart = vi.fn()) => {
    const target = Date.now() - 120_000
    render(
      <RestTimerOverlay
        targetTime={target}
        context={{ kind: 'rest', restoredExpired: true, restoredExpiredAtMs: target, nextSetLabel: '3ª série de Supino' }}
        onFinish={vi.fn()}
        onStart={onStart}
        onClose={vi.fn()}
        settings={null}
        autoStartEnabled
      />,
    )
    return onStart
  }

  it('mostra o START pro usuário, sem o flash "BORA!"', () => {
    renderRestored()
    expect(screen.getByText('START ▶')).toBeTruthy()
    expect(screen.queryByText('BORA!')).toBeNull()
  })

  it('não reagenda notificação nem Live Activity de descanso que já acabou', () => {
    renderRestored()
    expect(native.scheduleRestNotification).not.toHaveBeenCalled()
    expect(native.startRestLiveActivity).not.toHaveBeenCalled()
  })

  it('NÃO auto-avança, mesmo com AUTO ligado — o START é do usuário', () => {
    const onStart = renderRestored()
    vi.advanceTimersByTime(3000)
    expect(onStart).not.toHaveBeenCalled()
  })
})
