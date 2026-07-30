/**
 * O histórico de um exercício é escopado pelo TREINO de origem.
 *
 * Achado ao conferir prints reais de 29/07 contra o banco: "Remada na máquina"
 * aparece em cinco treinos do dono, com cargas que não se comparam —
 *
 *   TER · Pull - Dorsais + Bíceps ......... 110 kg
 *   TER · Upper A - Costas + Ombro ........ 100 kg
 *   QUA · Upper A - Costas + Ombro ......... 90 kg
 *   QUA · Pull - Costas + Bíceps ........... 60 kg
 *   QUA · Costas + Ombro ................... 40 kg
 *
 * Só no dia 14/07 o exercício apareceu em três treinos, com 60, 110 e 100 kg.
 * Como o histórico era agrupado apenas por NOME do exercício, a série temporal
 * virava ruído: o motor ancorava na carga de outro treino, e o deload lia a
 * alternância de contexto como "carga caiu" — o aviso de 29/07 na Remada era
 * falso positivo.
 */
import { describe, it, expect } from 'vitest'
import { pickUsableHistory } from '../hooks/useWorkoutAutoload'
import { analyzeDeloadHistory } from '../helpers/deloadHelpers'
import type { ReportHistoryItem } from '../types'

const PULL = 'ter · pull - dorsais + bíceps'
const UPPER = 'qua · upper a - costas + ombro'

/** Sessão de um exercício, num treino específico. */
const sess = (ts: number, workoutKey: string, weight: number, reps = 8): ReportHistoryItem & { workoutKey: string } => ({
  ts,
  workoutKey,
  avgWeight: weight,
  avgReps: reps,
  totalVolume: weight * reps * 3,
  topWeight: weight,
  setsCount: 3,
  setWeights: [weight, weight, weight],
  setReps: [reps, reps, reps],
  setRpes: [9, 9, 9],
  setFailures: null,
})

describe('motor de carga — ancora no MESMO treino', () => {
  it('ignora a sessão mais recente se for de outro treino', () => {
    const items = [
      sess(5000, PULL, 110), // mais recente, mas de outro treino
      sess(4000, UPPER, 90),
    ]
    const history = pickUsableHistory(items, UPPER)
    expect(history[0]).toMatchObject({ weight: 90 })
  })

  it('sem informar o treino, mantém o comportamento antigo (mais recente vence)', () => {
    const items = [sess(5000, PULL, 110), sess(4000, UPPER, 90)]
    expect(pickUsableHistory(items)[0]).toMatchObject({ weight: 110 })
  })

  it('pega a sessão mais recente DENTRO do treino, não a mais antiga', () => {
    const items = [
      sess(6000, PULL, 110),
      sess(5000, UPPER, 90),
      sess(3000, UPPER, 80),
    ]
    expect(pickUsableHistory(items, UPPER)[0]).toMatchObject({ weight: 90 })
  })

  it('cai para outros treinos quando não há histórico do treino atual', () => {
    const items = [sess(5000, PULL, 110)]
    // melhor calibrar por um treino parecido do que não sugerir nada
    expect(pickUsableHistory(items, UPPER)[0]).toMatchObject({ weight: 110 })
  })

  it('dentro do treino, ainda pula sessão de deload', () => {
    const items = [
      { ...sess(5000, UPPER, 60), deloadApplied: true },
      sess(4000, UPPER, 90),
    ]
    expect(pickUsableHistory(items, UPPER)[0]).toMatchObject({ weight: 90 })
  })

  it('caso real: três treinos no mesmo dia não se contaminam', () => {
    const items = [
      sess(1000, 'qua · pull - costas + bíceps', 60),
      sess(1000, PULL, 110),
      sess(1000, UPPER, 100),
    ]
    expect(pickUsableHistory(items, UPPER)[0]).toMatchObject({ weight: 100 })
    expect(pickUsableHistory(items, PULL)[0]).toMatchObject({ weight: 110 })
  })
})

describe('análise de deload — só compara o mesmo treino', () => {
  it('não acusa queda quando a variação é alternância entre treinos', () => {
    // Sequência que ANTES virava "carga caiu": alterna 110 (Pull) e 90 (Upper).
    const items = [
      sess(1000, PULL, 110),
      sess(2000, UPPER, 90),
      sess(3000, PULL, 110),
      sess(4000, UPPER, 90),
      sess(5000, PULL, 110),
      sess(6000, UPPER, 90),
    ]
    const a = analyzeDeloadHistory(items, UPPER)
    // dentro do Upper, a carga é estável em 90 — nada caiu
    expect(a.status).not.toBe('overtraining')
    expect(a.itemsCount).toBe(3)
  })

  it('sem itens do treino atual, declara falta de base em vez de analisar o agregado', () => {
    const items = [sess(1000, PULL, 110), sess(2000, PULL, 110)]
    const a = analyzeDeloadHistory(items, UPPER)
    expect(a.hasEnoughHistory).toBe(false)
    expect(a.itemsCount).toBe(0)
  })

  it('detecta queda REAL dentro do mesmo treino', () => {
    const items = [
      sess(1000, UPPER, 100),
      sess(2000, UPPER, 100),
      sess(3000, UPPER, 100),
      sess(4000, UPPER, 80),
      sess(5000, UPPER, 78),
      sess(6000, UPPER, 75),
    ]
    const a = analyzeDeloadHistory(items, UPPER)
    expect(a.hasEnoughHistory).toBe(true)
    expect(a.status).toBe('overtraining')
  })

  it('sem treino informado, segue analisando tudo (retrocompatível)', () => {
    const items = [sess(1000, UPPER, 100), sess(2000, UPPER, 100), sess(3000, UPPER, 100), sess(4000, UPPER, 100)]
    const a = analyzeDeloadHistory(items)
    expect(a.itemsCount).toBe(4)
  })
})
