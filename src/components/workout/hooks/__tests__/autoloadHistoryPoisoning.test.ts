/**
 * Guard: uma sessão PULADA não pode cegar o motor de carga.
 *
 * Caso real (29/07/2026). O "Crucifixo invertido na máquina" ficou sem sugestão
 * automática, e o dono estranhou. Cadeia do defeito:
 *
 *  1. Em 27/07 o motor prefilou 50 kg nas 3 séries (`weightSource: 'auto'`), mas o
 *     exercício NÃO foi executado — ficou `reps: null`, sem conclusão.
 *  2. Esse prefill entrou no histórico como se fosse treino feito, virando um item
 *     com `setWeights: [50,50,50]` e `setReps: null`.
 *  3. `buildHistorySets` exige peso E reps, então devolveu [] para esse item.
 *  4. A seleção pegava cegamente a sessão mais recente, sem fallback — o histórico
 *     bom de 22 e 24/07 foi ignorado e o motor concluiu "sem histórico".
 *  5. Nada disso aparecia na tela nem no Sentry.
 *
 * O invariante travado aqui é a CLASSE: qualquer sessão inutilizável (pulada,
 * abandonada, só com aquecimento) deve ser saltada em favor da anterior — não só
 * a que tem exatamente a forma do bug original.
 */
import { describe, it, expect } from 'vitest'
import { pickUsableHistory, buildHistorySets } from '../useWorkoutAutoload'

/** Sessão de 27/07: o motor prefilou o peso e o exercício foi pulado. */
const SESSAO_PULADA = {
  ts: 1785000000000,
  setWeights: [50, 50, 50],
  setReps: null,
  setRpes: null,
  setFailures: null,
}

/** Sessão de 24/07: treino de verdade. */
const SESSAO_BOA = {
  ts: 1784500000000,
  setWeights: [50, 50, 50],
  setReps: [20, 20, 18],
  setRpes: [7, 9, 10],
  setFailures: null,
}

/** Sessão de 22/07: mais antiga, também válida. */
const SESSAO_ANTIGA = {
  ts: 1784000000000,
  setWeights: [45, 45],
  setReps: [15, 15],
  setRpes: [8, 8],
  setFailures: null,
}

describe('buildHistorySets — só conta série com peso E reps', () => {
  it('descarta o prefill do motor (peso sem reps)', () => {
    expect(buildHistorySets(SESSAO_PULADA)).toEqual([])
  })

  it('aceita a sessão executada de verdade', () => {
    expect(buildHistorySets(SESSAO_BOA)).toHaveLength(3)
  })
})

describe('pickUsableHistory — sessão pulada não apaga o histórico', () => {
  it('salta a sessão pulada mais recente e usa a anterior (caso Crucifixo 29/07)', () => {
    const history = pickUsableHistory([SESSAO_BOA, SESSAO_PULADA, SESSAO_ANTIGA])
    expect(history).toHaveLength(3)
    expect(history[0]).toMatchObject({ weight: 50, reps: 20 })
  })

  it('usa a mais recente quando ela presta (não regride para a antiga à toa)', () => {
    const history = pickUsableHistory([SESSAO_ANTIGA, SESSAO_BOA])
    expect(history).toHaveLength(3)
    expect(history[0]).toMatchObject({ weight: 50, reps: 20 })
  })

  it('salta VÁRIAS sessões inutilizáveis seguidas', () => {
    const outraPulada = { ...SESSAO_PULADA, ts: 1785100000000 }
    const history = pickUsableHistory([outraPulada, SESSAO_PULADA, SESSAO_ANTIGA])
    expect(history).toHaveLength(2)
    expect(history[0]).toMatchObject({ weight: 45, reps: 15 })
  })

  it('devolve vazio quando NENHUMA sessão presta (aí é sem histórico de verdade)', () => {
    expect(pickUsableHistory([SESSAO_PULADA])).toEqual([])
    expect(pickUsableHistory([])).toEqual([])
    expect(pickUsableHistory(null)).toEqual([])
  })

  it('ordena por data, não pela ordem do array', () => {
    const history = pickUsableHistory([SESSAO_ANTIGA, SESSAO_PULADA, SESSAO_BOA])
    expect(history[0]).toMatchObject({ weight: 50, reps: 20 })
  })
})
