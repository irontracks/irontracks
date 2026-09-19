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

vi.mock('@/hooks/useSpeechToText', () => ({
  useSpeechToText: (opts: { onFinal: (t: string) => void }) => {
    capturedOnFinal = opts.onFinal
    return { gravando: false, parcial: '', erro: '', permissaoNegada: false, iniciar: sttIniciar, parar: sttParar, limparErro: vi.fn() }
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
