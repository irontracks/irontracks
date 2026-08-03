import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

import { useNativeTimerActions } from '../useNativeTimerActions'

/**
 * Descanso morto por ação nativa ATRASADA.
 *
 * BUG (relatado em treino, 03/08/2026): "aperto concluir e vai direto pro tempo de
 * treino, não pro descanso" — intermitente, sempre na PRIMEIRA série do exercício;
 * da 2ª para a 3ª funcionava.
 *
 * Causa: REST_DONE ("Iniciar Serie") e SKIP_REST ("Pular Descanso"), os botões da
 * notificação de tela bloqueada, encerram o descanso. O iOS ENFILEIRA a ação quando
 * o app está suspenso e a entrega quando ele acorda — depois de o usuário já ter
 * concluído a série seguinte. A ação de um descanso ANTIGO matava o descanso NOVO.
 *
 * Invariante: ação nativa não encerra descanso recém-criado (< 3s de vida).
 */

let notificationHandler: ((actionId: string) => void) | null = null

vi.mock('@/utils/native/irontracksNative', () => ({
  onNativeNotificationAction: (cb: (actionId: string) => void) => {
    notificationHandler = cb
    return () => { notificationHandler = null }
  },
}))

const logWarnRemote = vi.fn()
vi.mock('@/lib/logger', () => ({
  logWarnRemote: (...args: unknown[]) => logWarnRemote(...args),
}))

type Session = Record<string, unknown> | null

/** Simula o `setActiveSession` do React: aplica o updater sobre o estado atual. */
const makeSetSession = (initial: Session) => {
  const box = { current: initial }
  const setter = vi.fn((updater: unknown) => {
    box.current = typeof updater === 'function'
      ? (updater as (p: Session) => Session)(box.current)
      : (updater as Session)
  })
  return { box, setter }
}

const restingSince = (agoMs: number): Session => ({
  timerTargetTime: Date.now() + 60_000,
  timerContext: { kind: 'rest', key: '4-0', restStartedAtMs: Date.now() - agoMs },
  logs: {},
})

const NATIVE_CLOSE_ACTIONS = ['REST_DONE', 'SKIP_REST', 'START_REST'] as const

describe('ação nativa × descanso recém-criado', () => {
  beforeEach(() => {
    notificationHandler = null
    logWarnRemote.mockClear()
  })

  for (const action of NATIVE_CLOSE_ACTIONS) {
    it(`${action} atrasado NÃO mata um descanso que acabou de nascer`, () => {
      // O cenário do bug: descanso com 200ms de vida (o usuário acabou de concluir
      // a série) recebe a ação que ele tocou no descanso ANTERIOR.
      const { box, setter } = makeSetSession(restingSince(200))
      renderHook(() => useNativeTimerActions({ setActiveSession: setter }))

      notificationHandler!(action)

      expect(box.current?.timerTargetTime, `${action} encerrou o descanso novo`).toBeTruthy()
      expect(box.current?.timerContext).toBeTruthy()
    })
  }

  for (const action of NATIVE_CLOSE_ACTIONS) {
    it(`${action} legítimo continua encerrando o descanso`, () => {
      // Uso real: o usuário está descansando há 20s e toca na notificação.
      const { box, setter } = makeSetSession(restingSince(20_000))
      renderHook(() => useNativeTimerActions({ setActiveSession: setter }))

      notificationHandler!(action)

      expect(box.current?.timerTargetTime).toBeNull()
      expect(box.current?.timerContext).toBeNull()
    })
  }

  it('a ação descartada é reportada — o bug não pode voltar a ser invisível', () => {
    const { setter } = makeSetSession(restingSince(200))
    renderHook(() => useNativeTimerActions({ setActiveSession: setter }))

    notificationHandler!('REST_DONE')

    expect(logWarnRemote).toHaveBeenCalledOnce()
    const [tag, , payload] = logWarnRemote.mock.calls[0] as [string, string, Record<string, unknown>]
    expect(tag).toBe('workout.rest.native-action-ignored')
    expect(payload.actionId).toBe('REST_DONE')
  })

  it('sem descanso ativo, a ação não faz nada nem reporta', () => {
    const { box, setter } = makeSetSession({ timerTargetTime: null, timerContext: null, logs: {} })
    renderHook(() => useNativeTimerActions({ setActiveSession: setter }))

    notificationHandler!('SKIP_REST')

    expect(box.current?.timerTargetTime).toBeNull()
    expect(logWarnRemote).not.toHaveBeenCalled()
  })

  it('descanso sem restStartedAtMs (legado) é encerrado normalmente', () => {
    // Sessão antiga sem o campo: não dá para medir idade, e travar o encerramento
    // seria pior — o usuário ficaria sem conseguir pular o descanso.
    const { box, setter } = makeSetSession({
      timerTargetTime: Date.now() + 60_000,
      timerContext: { kind: 'rest', key: '4-0' },
      logs: {},
    })
    renderHook(() => useNativeTimerActions({ setActiveSession: setter }))

    notificationHandler!('SKIP_REST')

    expect(box.current?.timerTargetTime).toBeNull()
  })

  it('ADD_30S segue funcionando', () => {
    const base = Date.now() + 60_000
    const { box, setter } = makeSetSession({
      timerTargetTime: base,
      timerContext: { kind: 'rest', key: '4-0', restStartedAtMs: Date.now() - 20_000 },
      logs: {},
    })
    renderHook(() => useNativeTimerActions({ setActiveSession: setter }))

    notificationHandler!('ADD_30S')

    expect(Number(box.current?.timerTargetTime)).toBe(base + 30_000)
  })
})
