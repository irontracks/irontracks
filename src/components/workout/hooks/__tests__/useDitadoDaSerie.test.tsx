import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useDitadoDaSerie } from '../useDitadoDaSerie'

/**
 * Fiação de `useDitadoDaSerie` — a fronteira única de escrita da voz.
 *
 * Três invariantes que `docs/plans/voz-na-serie.md` marca como obrigatórios:
 *  1. `weightSource: 'user'` em TODA escrita de peso (senão o autoload
 *     reescreve por cima — bug real de 22/08/2026, ver CLAUDE.md);
 *  2. "não entendi" nunca chama `updateLog`;
 *  3. ditar duas vezes seguidas preenche séries DIFERENTES (a regra derivada
 *     da combinação "por exercício" + "não conclui automaticamente").
 */

let capturedOnFinal: ((texto: string) => void) | null = null
const sttIniciar = vi.fn()
const sttParar = vi.fn()
/** Mutável de propósito — o teste de regressão do erro precisa fazer o mock
 *  MUDAR entre renders (gravando true → false, com erro), e um objeto fixo
 *  não permite isso. */
const sttMockState = { gravando: false, erro: '' }

vi.mock('@/hooks/useSpeechToText', () => ({
  useSpeechToText: (opts: { onFinal: (t: string) => void }) => {
    capturedOnFinal = opts.onFinal
    return {
      gravando: sttMockState.gravando, parcial: '', erro: sttMockState.erro,
      permissaoNegada: false, iniciar: sttIniciar, parar: sttParar, limparErro: vi.fn(),
    }
  },
}))

vi.mock('@/lib/telemetry/userActivity', () => ({ trackUserEvent: vi.fn() }))

vi.mock('@/lib/workout/vozAtivaSingleton', () => ({
  coordenadorDeVozUnica: { iniciar: vi.fn(), finalizar: vi.fn() },
}))

const exercicio = (sets: number, extra: Record<string, unknown> = {}) => ({
  sets, setDetails: Array.from({ length: sets }, () => ({})), ...extra,
})

beforeEach(() => {
  capturedOnFinal = null
  sttIniciar.mockClear()
  sttParar.mockClear()
  sttMockState.gravando = false
  sttMockState.erro = ''
})

function montar(exercises: unknown, logs: unknown, updateLog: ReturnType<typeof vi.fn>) {
  return renderHook(() => useDitadoDaSerie({ exercises, logs, exIdx: 0, updateLog }))
}

describe('useDitadoDaSerie — peso sempre é do USUÁRIO', () => {
  it('escreve weightSource: "user" junto do peso', () => {
    const updateLog = vi.fn()
    montar([exercicio(2)], {}, updateLog)

    act(() => { capturedOnFinal?.('100kg 12 reps') })

    expect(updateLog).toHaveBeenCalledWith('0-0', expect.objectContaining({
      weight: '100', weightSource: 'user', reps: '12',
    }))
  })

  it('exercício unilateral escreve L_weight/R_weight, os dois com o mesmo peso', () => {
    const updateLog = vi.fn()
    montar([exercicio(2, { isUnilateral: true })], {}, updateLog)

    act(() => { capturedOnFinal?.('80kg 10 reps') })

    expect(updateLog).toHaveBeenCalledWith('0-0', expect.objectContaining({
      L_weight: '80', R_weight: '80', weightSource: 'user',
    }))
    expect(updateLog.mock.calls[0][1]).not.toHaveProperty('weight')
  })
})

describe('useDitadoDaSerie — falha muscular por voz', () => {
  /**
   * `log.failure` é o MESMO campo do botão 🔥 do card, e alimenta a trava
   * anti-progressão do motor de carga. Marcar por voz é marcação MANUAL do
   * usuário — exatamente o que o guard `failureIsManualOnly` protege; o que
   * ele proíbe é o app DEDUZIR a falha do método.
   */
  it('dizer "falha" marca failure: true no log', () => {
    const updateLog = vi.fn()
    montar([exercicio(2)], {}, updateLog)

    act(() => { capturedOnFinal?.('120 quilos 5 reps RP 10 e falha') })

    expect(updateLog).toHaveBeenCalledWith('0-0', expect.objectContaining({ failure: true }))
  })

  it('sem dizer "falha", o campo NÃO entra no patch (não desmarca o que o botão marcou)', () => {
    const updateLog = vi.fn()
    montar([exercicio(2)], {}, updateLog)

    act(() => { capturedOnFinal?.('120 quilos 5 reps') })

    expect(updateLog.mock.calls[0][1]).not.toHaveProperty('failure')
  })

  it('"sem falha" não marca — a negação é respeitada até a escrita', () => {
    const updateLog = vi.fn()
    montar([exercicio(2)], {}, updateLog)

    act(() => { capturedOnFinal?.('120 quilos 5 reps sem falha') })

    expect(updateLog.mock.calls[0][1]).not.toHaveProperty('failure')
  })
})

describe('useDitadoDaSerie — reps implausíveis pedem conferência, sem bloquear', () => {
  /**
   * O dono falou "100 repetições" por engano (19/09/2026) e o app gravou sem
   * piscar. Decisão dele: AVISAR, não recusar — série longa de verdade existe
   * (abdominal, panturrilha, cardio), e um teto recusaria dado real.
   */
  it('grava o valor E sinaliza para conferência', () => {
    const updateLog = vi.fn()
    const { result } = montar([exercicio(2)], {}, updateLog)

    act(() => { capturedOnFinal?.('120 quilos 100 repetições') })

    // Gravou — não bloqueou.
    expect(updateLog).toHaveBeenCalledWith('0-0', expect.objectContaining({ reps: '100' }))
    // …e pediu conferência.
    expect(result.current.ultimoResultado?.repsSuspeita).toBe(100)
  })

  it('número plausível não vira aviso', () => {
    const { result } = montar([exercicio(2)], {}, vi.fn())

    act(() => { capturedOnFinal?.('120 quilos 12 repetições') })

    expect(result.current.ultimoResultado?.entendeu).toBe(true)
    expect(result.current.ultimoResultado?.repsSuspeita).toBeUndefined()
  })
})

describe('useDitadoDaSerie — "não entendi" não escreve nada', () => {
  it('fala sem nenhum número reconhecível: updateLog nunca é chamado', () => {
    const updateLog = vi.fn()
    montar([exercicio(2)], {}, updateLog)

    act(() => { capturedOnFinal?.('não consegui hoje') })

    expect(updateLog).not.toHaveBeenCalled()
  })
})

describe('useDitadoDaSerie — ditar duas vezes preenche séries DIFERENTES', () => {
  it('a segunda fala não sobrescreve a primeira série', () => {
    const updateLog = vi.fn()
    // Cada updateLog simula o merge real (useActiveWorkoutController) —
    // sem isso a segunda chamada não veria o reps gravado pela primeira.
    const logsAcumulados: Record<string, Record<string, unknown>> = {}
    updateLog.mockImplementation((key: string, patch: Record<string, unknown>) => {
      logsAcumulados[key] = { ...(logsAcumulados[key] || {}), ...patch }
    })

    const { rerender } = renderHook(
      ({ logs }) => useDitadoDaSerie({ exercises: [exercicio(4)], logs, exIdx: 0, updateLog }),
      { initialProps: { logs: logsAcumulados as unknown } },
    )

    act(() => { capturedOnFinal?.('100kg 12 reps') })
    expect(updateLog).toHaveBeenCalledWith('0-0', expect.objectContaining({ reps: '12' }))

    rerender({ logs: { ...logsAcumulados } })
    act(() => { capturedOnFinal?.('90kg 10 reps') })
    expect(updateLog).toHaveBeenCalledWith('0-1', expect.objectContaining({ reps: '10' }))
    expect(updateLog).not.toHaveBeenCalledWith('0-0', expect.objectContaining({ reps: '10' }))
  })

  it('"série 1" corrige a primeira mesmo depois de a segunda já ter sido preenchida', () => {
    const updateLog = vi.fn()
    const logsAcumulados: Record<string, Record<string, unknown>> = { '0-0': { reps: '12' } }
    montar([exercicio(4)], logsAcumulados, updateLog)

    act(() => { capturedOnFinal?.('série 1 105kg 12 reps') })

    expect(updateLog).toHaveBeenCalledWith('0-0', expect.objectContaining({ weight: '105' }))
  })
})

describe('useDitadoDaSerie — ERRO do reconhecedor libera a trava de voz única', () => {
  /**
   * Achado real (relato do dono em produção, 19/09/2026): "Erro no
   * reconhecimento de voz: Recognition request was canceled" é um erro nativo
   * comum do iOS (Speech framework), disparado por `rec.onerror`. Esse
   * caminho NUNCA chama `onFinal` — só `setErro`/`setGravando(false)` dentro
   * de `useSpeechToText`. A versão anterior liberava a trava de "só um
   * ditado por vez" (`vozAtivaSingleton`) apenas dentro de `onFinal`, então
   * um erro deixava a trava presa: a PRÓXIMA tentativa, em QUALQUER
   * exercício, tentaria parar um reconhecedor que já não existia mais.
   */
  it('gravando → parou COM erro: finalizar() é chamado mesmo sem onFinal rodar', async () => {
    const { coordenadorDeVozUnica } = await import('@/lib/workout/vozAtivaSingleton')
    const finalizarSpy = coordenadorDeVozUnica.finalizar as ReturnType<typeof vi.fn>
    finalizarSpy.mockClear()

    sttMockState.gravando = true
    const { rerender } = renderHook(() => useDitadoDaSerie({ exercises: [exercicio(2)], logs: {}, exIdx: 0, updateLog: vi.fn() }))
    expect(finalizarSpy).not.toHaveBeenCalled()

    // O reconhecedor cancelou — gravando cai para false, erro aparece,
    // onFinal NUNCA é chamado (capturedOnFinal não é invocado aqui).
    sttMockState.gravando = false
    sttMockState.erro = 'Erro no reconhecimento de voz: Recognition request was canceled'
    rerender()

    expect(finalizarSpy).toHaveBeenCalledTimes(1)
  })

  it('gravando → parou SEM erro (fluxo normal): finalizar() também é chamado — não regride o caso feliz', async () => {
    const { coordenadorDeVozUnica } = await import('@/lib/workout/vozAtivaSingleton')
    const finalizarSpy = coordenadorDeVozUnica.finalizar as ReturnType<typeof vi.fn>
    finalizarSpy.mockClear()

    sttMockState.gravando = true
    const { rerender } = renderHook(() => useDitadoDaSerie({ exercises: [exercicio(2)], logs: {}, exIdx: 0, updateLog: vi.fn() }))

    sttMockState.gravando = false
    rerender()

    expect(finalizarSpy).toHaveBeenCalledTimes(1)
  })
})
