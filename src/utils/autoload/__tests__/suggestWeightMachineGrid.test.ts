import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

import { suggestWeight } from '../suggestWeight'
import { collectKnownWeights } from '@/components/workout/hooks/useWorkoutAutoload'

/**
 * Integração: o grid aprendido da máquina chegando ao número final do motor.
 *
 * `machineGrid.test.ts` cobre o algoritmo isolado. Aqui o que se prova é a FIAÇÃO —
 * que `knownWeights` atravessa `suggestWeight` e muda a carga sugerida. Sem este
 * teste, quebrar o repasse no hook deixaria os testes de unidade verdes e o motor
 * voltaria a pedir peso inexistente, em silêncio.
 */

/** Mesa flexora real (produção, 03/08/2026): stack em libras, degraus de ~4,5 kg. */
const MESA_FLEXORA = [18, 23, 27, 32, 36, 41, 45, 50, 54, 59, 63]

describe('suggestWeight × grid da máquina', () => {
  it('sem knownWeights, arredonda de 5 em 5 e pede um peso que a máquina não tem', () => {
    // Comportamento ANTERIOR, preservado como referência do problema.
    const s = suggestWeight({
      history: [{ weight: 45, reps: 10, rpe: 8 }],
      targetReps: 10,
      equipment: ['maquina'],
    })
    expect(s.weight).toBe(45)

    const subindo = suggestWeight({
      history: [{ weight: 45, reps: 12, rpe: 6 }],
      targetReps: 8,
      equipment: ['maquina'],
    })
    // Múltiplo de 5 — e 5 dos 10 degraus dessa máquina não são múltiplos de 5.
    expect(subindo.weight! % 5).toBe(0)
  })

  it('com knownWeights, o peso sugerido SEMPRE existe no aparelho', () => {
    const existe = new Set(MESA_FLEXORA)
    // Varre vários pontos de partida para não depender de um caso feliz.
    for (const base of [23, 27, 32, 36, 41, 45, 50]) {
      const s = suggestWeight({
        history: [{ weight: base, reps: 12, rpe: 6 }],
        targetReps: 8,
        equipment: ['maquina'],
        knownWeights: MESA_FLEXORA,
      })
      expect(s.weight).not.toBeNull()
      expect(
        existe.has(s.weight!),
        `sugeriu ${s.weight}kg, que não existe nessa máquina (base ${base})`,
      ).toBe(true)
    }
  })

  it('explica que ajustou ao aparelho, em vez de deixar o usuário estranhar o número', () => {
    const s = suggestWeight({
      history: [{ weight: 41, reps: 12, rpe: 6 }],
      targetReps: 8,
      equipment: ['maquina'],
      knownWeights: MESA_FLEXORA,
    })
    expect(s.rationale).toContain('essa máquina tem')
  })

  it('não regride: o grid nunca derruba abaixo da carga anterior num dia normal', () => {
    // A trava anti-regressão continua valendo depois do snap.
    const s = suggestWeight({
      history: [{ weight: 50, reps: 10, rpe: 8 }],
      targetReps: 10,
      equipment: ['maquina'],
      knownWeights: MESA_FLEXORA,
    })
    expect(s.weight).toBeGreaterThanOrEqual(50)
  })

  it('histórico ruim demais para grid → cai no arredondamento por equipamento', () => {
    const s = suggestWeight({
      history: [{ weight: 40, reps: 10, rpe: 8 }],
      targetReps: 10,
      equipment: ['maquina'],
      knownWeights: [40, 40, 40], // um valor só: não é sequência
    })
    expect(s.weight).toBe(40)
    expect(s.rationale).not.toContain('essa máquina tem')
  })
})

describe('collectKnownWeights — a fonte dos pesos', () => {
  it('junta os pesos de TODAS as sessões, não só da última', () => {
    const items = [
      { setWeights: [18, 18, 23] },
      { setWeights: [27, 32] },
      { setWeights: [36, null, 41] },
    ]
    expect(collectKnownWeights(items).sort((a, b) => a - b)).toEqual([18, 18, 23, 27, 32, 36, 41])
  })

  it('inclui sessões de deload e de outros treinos — um peso registrado prova que o furo existe', () => {
    // Diferente de `pickUsableHistory`, que filtra por qualidade da sessão: aqui a
    // pergunta é "esse valor existe no aparelho?", e deload responde isso igual.
    const items = [
      { setWeights: [50], deloadApplied: true, workoutKey: 'treino-b' },
      { setWeights: [54, 59] },
    ]
    expect(collectKnownWeights(items)).toContain(50)
  })

  it('descarta nulo, zero e lixo sem quebrar', () => {
    const items = [
      { setWeights: [0, -5, null, 23] },
      { setWeights: null },
      {},
    ]
    expect(collectKnownWeights(items)).toEqual([23])
    expect(collectKnownWeights(null)).toEqual([])
  })
})

describe('a fiação do hook até o motor', () => {
  /**
   * Source-guard porque os testes acima NÃO pegavam a regressão que importa.
   * Verificado por mutação: removendo `knownWeights` da chamada de `suggestWeight`
   * no hook, os 198 testes continuavam VERDES — o algoritmo e o coletor seguem
   * corretos isoladamente, só que ninguém mais os liga. O motor voltaria a pedir
   * peso inexistente sem que nada acusasse.
   *
   * Exercitar o hook de verdade exigiria montar reportHistory, settings, logs e
   * providers; o invariante aqui é de UMA linha e é legível no fonte.
   */
  const hookSrc = readFileSync('src/components/workout/hooks/useWorkoutAutoload.ts', 'utf8')

  it('o hook repassa os pesos conhecidos para suggestWeight', () => {
    expect(
      hookSrc,
      'o motor perdeu o grid da máquina: `knownWeights` sumiu da chamada de suggestWeight no hook',
    ).toMatch(/knownWeights:\s*collectKnownWeights\(/)
  })

  it('os pesos vêm de TODAS as sessões, não do histórico já filtrado', () => {
    // `pickUsableHistory` devolve UMA sessão — usá-la aqui reduziria o grid a um
    // punhado de valores e o snap quase nunca acharia degrau.
    expect(hookSrc).toMatch(/collectKnownWeights\(ordered\)/)
  })
})
