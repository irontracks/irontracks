import { renderHook } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { useWorkoutMethodSavers } from '../useWorkoutMethodSavers'

/**
 * Guard: peso salvo pelo modal de método avançado é do USUÁRIO.
 *
 * INVARIANTE (CLAUDE.md): "weightSource: 'user' no log = o usuário assumiu
 * aquela série; o motor NUNCA reescreve depois disso."
 *
 * O BUG QUE ORIGINOU ESTE GUARD
 * Os savers gravavam `weight` sem `weightSource`. Quando o autoload já tinha
 * preenchido a caixa, a fonte continuava 'auto' depois do save — e a guarda do
 * useAutoloadWeight (`current !== '' && weightSource !== 'auto'`) não pegava,
 * justamente porque a fonte ERA 'auto'. O efeito então reescrevia o peso do
 * usuário de volta pra sugestão do motor.
 *
 * Reproduzido antes da correção: log { weight: '65', weightSource: 'auto' } +
 * sugestão 60 => o motor escrevia '60' por cima do 65 salvo no modal.
 *
 * O NormalSet nunca teve o problema porque marca 'user' ao digitar. São os 13
 * métodos avançados, que editam por modal, que dependiam disto.
 */

const noop = () => {}
const makeSetter = () => vi.fn()

/** Props mínimos: só o modal sob teste é preenchido. */
function buildProps(updateLog: ReturnType<typeof vi.fn>, overrides: Record<string, unknown>) {
  const base: Record<string, unknown> = {
    clusterModal: null,
    restPauseModal: null,
    dropSetModal: null,
    strippingModal: null,
    fst7Modal: null,
    heavyDutyModal: null,
    pontoZeroModal: null,
    forcedRepsModal: null,
    negativeRepsModal: null,
    partialRepsModal: null,
    sistema21Modal: null,
    waveModal: null,
    groupMethodModal: null,
    setClusterModal: makeSetter(),
    setRestPauseModal: makeSetter(),
    setDropSetModal: makeSetter(),
    setStrippingModal: makeSetter(),
    setFst7Modal: makeSetter(),
    setHeavyDutyModal: makeSetter(),
    setPontoZeroModal: makeSetter(),
    setForcedRepsModal: makeSetter(),
    setNegativeRepsModal: makeSetter(),
    setPartialRepsModal: makeSetter(),
    setSistema21Modal: makeSetter(),
    setWaveModal: makeSetter(),
    setGroupMethodModal: makeSetter(),
    getLog: () => ({}),
    updateLog,
    startTimer: noop,
  }
  return { ...base, ...overrides }
}

describe('savers de método avançado marcam o peso como do usuário', () => {
  it('Ponto Zero: salvar pelo modal grava weightSource "user"', () => {
    const updateLog = vi.fn()
    const props = buildProps(updateLog, {
      pontoZeroModal: { key: '0-0', weight: '65', reps: '10', hold_sec: 4, rpe: '8' },
    })

    const { result } = renderHook(() => useWorkoutMethodSavers(props as never))
    result.current.savePontoZeroModal()

    expect(updateLog).toHaveBeenCalledTimes(1)
    const [key, patch] = updateLog.mock.calls[0]
    expect(key).toBe('0-0')
    expect(patch).toMatchObject({ weight: '65', weightSource: 'user' })
  })

  it('Heavy Duty: salvar pelo modal grava weightSource "user"', () => {
    const updateLog = vi.fn()
    const props = buildProps(updateLog, {
      heavyDutyModal: { key: '1-2', weight: '80', reps_failure: '6', rpe: '10' },
    })

    const { result } = renderHook(() => useWorkoutMethodSavers(props as never))
    result.current.saveHeavyDutyModal()

    expect(updateLog).toHaveBeenCalledTimes(1)
    expect(updateLog.mock.calls[0][1]).toMatchObject({ weightSource: 'user' })
  })

  /**
   * Source-guard da CLASSE: são 13 savers e o próximo método vai copiar um
   * vizinho. A marcação vive no wrapper `updateLog` da fronteira do hook — se
   * alguém voltar a chamar o `rawUpdateLog` dentro de um handler, escapa dela.
   */
  it('nenhum handler chama rawUpdateLog direto (a marcação vive no wrapper)', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/components/workout/hooks/useWorkoutMethodSavers.ts'),
      'utf8',
    )
    const wrapperDefinition = /const\s+updateLog[^=]*=\s*\(key, patch\)/.test(src)
    expect(wrapperDefinition, 'o wrapper que marca weightSource sumiu').toBe(true)

    // A única chamada legítima a rawUpdateLog está dentro do próprio wrapper.
    const rawCalls = src.match(/rawUpdateLog\(/g) ?? []
    expect(rawCalls.length).toBe(2)
  })
})
