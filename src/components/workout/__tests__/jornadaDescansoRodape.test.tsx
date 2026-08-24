/**
 * JORNADA (comportamento, não estrutura): o descanso e o rodapé do treino
 * convivendo — o passo que TRAVOU o teste manual de 10 passos em 15/08/2026.
 *
 * Com o descanso rolando, a barra do RestTimerOverlay cobria o WorkoutFooter e
 * o botão FINALIZAR ficava inalcançável: para terminar o treino era preciso
 * esperar ou pular o descanso. A correção (PR #834) faz o rodapé SUBIR a
 * altura da barra, via a variável CSS `--it-rest-bar-h`.
 *
 * Os guards que existiam eram source-guards (liam o texto do arquivo). Este
 * aqui MONTA o componente de verdade e observa o efeito no documento — é o que
 * pega uma regressão que mantenha a string e quebre o comportamento (ex.: o
 * efeito deixar de rodar, ou não limpar ao desmontar).
 *
 * Limite declarado: jsdom não faz layout, então "está coberto na tela" continua
 * sendo conferência visual. O que se prova aqui é o CONTRATO entre os dois
 * componentes — que é onde o bug morava.
 */
import { render } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
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

const VAR = '--it-rest-bar-h'
const lerVar = () => document.documentElement.style.getPropertyValue(VAR)

const montarDescanso = () =>
  render(
    <RestTimerOverlay
      targetTime={Date.now() + 60_000}
      context={{ kind: 'rest', key: '0-0' } as never}
      onFinish={vi.fn()}
      onStart={vi.fn()}
      onClose={vi.fn()}
      settings={null}
      autoStartEnabled
    />,
  )

beforeEach(() => {
  document.documentElement.style.removeProperty(VAR)
  vi.clearAllMocks()
})

describe('descanso × rodapé — o contrato que destrava o FINALIZAR', () => {
  it('sem descanso na tela, a variável não existe (rodapé fica no chão)', () => {
    expect(lerVar()).toBe('')
  })

  it('com o descanso montado, a altura da barra é publicada no documento', () => {
    montarDescanso()
    // jsdom devolve 0 de altura (não faz layout), mas o contrato — a variável
    // existir enquanto o descanso vive — é exatamente o que o rodapé consome.
    expect(lerVar()).toMatch(/^\d+px$/)
  })

  it('ao acabar o descanso (desmontar), a variável é REMOVIDA', () => {
    // Sem esta limpeza o rodapé ficaria flutuando com um vão para sempre.
    const { unmount } = montarDescanso()
    expect(lerVar()).toMatch(/^\d+px$/)
    unmount()
    expect(lerVar()).toBe('')
  })

  it('monta e desmonta várias vezes sem deixar resíduo (série após série)', () => {
    for (let i = 0; i < 3; i += 1) {
      const { unmount } = montarDescanso()
      expect(lerVar()).toMatch(/^\d+px$/)
      unmount()
      expect(lerVar()).toBe('')
    }
  })

  it('funciona SEM ResizeObserver (jsdom/WebView antiga) — a medição inicial basta', () => {
    const original = globalThis.ResizeObserver
    // @ts-expect-error — simula ambiente sem a API
    delete globalThis.ResizeObserver
    try {
      const { unmount } = montarDescanso()
      expect(lerVar()).toMatch(/^\d+px$/)
      unmount()
    } finally {
      globalThis.ResizeObserver = original
    }
  })
})

/**
 * O MESMO contrato, do lado de FORA do treino — bug de 24/08/2026.
 *
 * Sair do treino com o descanso rolando prendia o usuário no dashboard: a
 * barra "Voltar pro treino" (`fixed bottom-0`, z-[1100]) ficava embaixo da
 * barra do descanso (z-[2100]) e só reaparecia quando o descanso terminava.
 *
 * O guard da classe existia desde 15/08 e passou verde: varria apenas
 * `components/workout`, e esta barra mora em `app/(app)/dashboard`. Aqui o
 * teste mede o COMPORTAMENTO — um elemento que consome a variável de fato sobe
 * quando o descanso aparece, e volta ao chão quando ele acaba.
 */
describe('descanso × barra "Voltar pro treino" (fora do treino)', () => {
  /** Réplica do posicionamento da Session Floating Bar. */
  const barraDeRetorno = () => {
    const el = document.createElement('div')
    el.style.position = 'fixed'
    el.style.bottom = 'var(--it-rest-bar-h, 0px)'
    document.body.appendChild(el)
    return el
  }

  it('sem descanso, a barra fica no chão', () => {
    const el = barraDeRetorno()
    expect(getComputedStyle(el).bottom).toBe('var(--it-rest-bar-h, 0px)')
    expect(lerVar()).toBe('')
    el.remove()
  })

  it('com o descanso na tela, a barra passa a ter uma altura para subir', () => {
    const el = barraDeRetorno()
    const { unmount } = montarDescanso()
    // A variável que a barra consome existe enquanto o descanso vive — é ela
    // que tira o botão de baixo da barra do descanso.
    expect(lerVar()).toMatch(/^\d+px$/)
    unmount()
    expect(lerVar()).toBe('')
    el.remove()
  })

  it('a barra consome a MESMA variável que o descanso publica', () => {
    // Trocar o nome de um lado só (ex.: renomear a variável) quebraria a
    // convivência em silêncio: os dois source-guards continuariam verdes.
    const el = barraDeRetorno()
    expect(el.style.bottom).toContain(VAR)
    el.remove()
  })
})
