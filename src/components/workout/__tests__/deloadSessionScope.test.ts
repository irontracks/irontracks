import { describe, it, expect } from 'vitest'
import { analyzeDeloadHistory, buildSessionDeloadAlert } from '../helpers/deloadHelpers'
import { detectSessionDeload, isDeloadSession } from '@/utils/report/sessionDeload'
import { buildTrainingLoadFlags, buildWeeklyVolumeStats, buildReportMetrics } from '@/utils/report/reportMetrics'
import {
  DELOAD_SESSION_MIN_EXERCISES,
  DELOAD_REDUCTION_OVERTRAIN,
  DELOAD_REDUCTION_STAGNATION,
} from '../utils'
import type { ReportHistoryItem } from '../types'

/**
 * DESCARGA (deload) NO ESCOPO DA SESSÃO — jul/2026.
 *
 * O diagnóstico continua por exercício; a decisão passou a ser do treino. Estes
 * guards travam os três invariantes que a mudança introduziu.
 */

const item = (over: Partial<ReportHistoryItem> = {}): ReportHistoryItem => ({
  ts: 1,
  avgWeight: 100,
  avgReps: 10,
  totalVolume: 3000,
  topWeight: 100,
  setsCount: 3,
  workoutKey: 'treino a',
  ...over,
} as ReportHistoryItem)

describe('analyzeDeloadHistory — descarga não é evidência de regressão', () => {
  /**
   * O deload se auto-alimentava: aplicar −22 % derruba o volume MUITO além do
   * limiar de 3 % de regressão, então a análise seguinte lia "regressão" e
   * sugeria outro corte — espiral descendente. O motor de carga já pulava essas
   * sessões (`useWorkoutAutoload`: `if (item?.deloadApplied) continue`); a
   * análise ficava de fora da mesma regra. Latente enquanto ninguém aplicava
   * deload (0 de 547 sessões), ativo no primeiro uso de verdade.
   */
  it('ignora as sessões em que a própria descarga foi aplicada', () => {
    const historico = [
      item({ ts: 1, avgWeight: 100, totalVolume: 3000 }),
      item({ ts: 2, avgWeight: 100, totalVolume: 3000 }),
      item({ ts: 3, avgWeight: 100, totalVolume: 3000 }),
      item({ ts: 4, avgWeight: 100, totalVolume: 3000 }),
      // Descarga: carga cai 22 % porque o app mandou, não porque o aluno regrediu.
      item({ ts: 5, avgWeight: 78, totalVolume: 2340, deloadApplied: true }),
      item({ ts: 6, avgWeight: 78, totalVolume: 2340, deloadApplied: true }),
    ]
    const a = analyzeDeloadHistory(historico, 'treino a')
    expect(a.status).not.toBe('overtraining')
  })

  it('regressão de verdade (sem descarga) continua sendo detectada', () => {
    const historico = [
      item({ ts: 1, avgWeight: 100, totalVolume: 3000 }),
      item({ ts: 2, avgWeight: 100, totalVolume: 3000 }),
      item({ ts: 3, avgWeight: 100, totalVolume: 3000 }),
      item({ ts: 4, avgWeight: 80, totalVolume: 2400 }),
      item({ ts: 5, avgWeight: 80, totalVolume: 2400 }),
      item({ ts: 6, avgWeight: 80, totalVolume: 2400 }),
    ]
    expect(analyzeDeloadHistory(historico, 'treino a').status).toBe('overtraining')
  })
})

describe('buildSessionDeloadAlert — quando a descarga vira decisão do treino', () => {
  const alerta = (status: 'stagnation' | 'overtraining', itemsCount = 5) =>
    ({ status, suggestedPct: 0.15, itemsCount })

  it(`com menos de ${DELOAD_SESSION_MIN_EXERCISES} exercícios não promove (caso local fica no card)`, () => {
    const r = buildSessionDeloadAlert(
      { 0: alerta('stagnation') },
      DELOAD_SESSION_MIN_EXERCISES, DELOAD_REDUCTION_OVERTRAIN, DELOAD_REDUCTION_STAGNATION,
    )
    expect(r).toBeNull()
  })

  it('a partir do mínimo, promove e lista os exercícios em ordem', () => {
    const r = buildSessionDeloadAlert(
      { 3: alerta('stagnation'), 0: alerta('stagnation') },
      DELOAD_SESSION_MIN_EXERCISES, DELOAD_REDUCTION_OVERTRAIN, DELOAD_REDUCTION_STAGNATION,
    )
    expect(r?.exIdxs).toEqual([0, 3])
    expect(r?.status).toBe('stagnation')
    expect(r?.suggestedPct).toBe(DELOAD_REDUCTION_STAGNATION)
  })

  it('regressão em UM exercício manda o cenário e a redução maior', () => {
    const r = buildSessionDeloadAlert(
      { 0: alerta('stagnation'), 1: alerta('overtraining') },
      DELOAD_SESSION_MIN_EXERCISES, DELOAD_REDUCTION_OVERTRAIN, DELOAD_REDUCTION_STAGNATION,
    )
    expect(r?.status).toBe('overtraining')
    expect(r?.suggestedPct).toBe(DELOAD_REDUCTION_OVERTRAIN)
  })

  it('itemsCount é a evidência mais fraca do conjunto (é o número que o texto mostra)', () => {
    const r = buildSessionDeloadAlert(
      { 0: alerta('stagnation', 9), 1: alerta('stagnation', 4) },
      DELOAD_SESSION_MIN_EXERCISES, DELOAD_REDUCTION_OVERTRAIN, DELOAD_REDUCTION_STAGNATION,
    )
    expect(r?.itemsCount).toBe(4)
  })
})

describe('sessão de descarga — detectada a partir dos logs', () => {
  const logsComDeload = {
    '0-0': { done: true, weight: '78', reps: '10', deload: { originalWeight: 100, suggestedWeight: 78, reductionPct: 0.22 } },
    '0-1': { done: true, weight: '78', reps: '10', deload: { originalWeight: 100, suggestedWeight: 78, reductionPct: 0.22 } },
    '1-0': { done: true, weight: '40', reps: '12' },
  }

  it('resume séries, exercícios e redução média', () => {
    const d = detectSessionDeload(logsComDeload)
    expect(d.applied).toBe(true)
    expect(d.setsCount).toBe(2)
    expect(d.exerciseIdxs).toEqual([0])
    expect(d.avgReductionPct).toBeCloseTo(0.22, 3)
  })

  it('deriva a redução dos pesos quando reductionPct não veio', () => {
    const d = detectSessionDeload({ '0-0': { deload: { originalWeight: 100, suggestedWeight: 80 } } })
    expect(d.avgReductionPct).toBeCloseTo(0.2, 3)
  })

  it('sessão normal não é descarga', () => {
    expect(isDeloadSession({ logs: { '0-0': { weight: '100', reps: '10', done: true } } })).toBe(false)
  })

  it('reportMeta.deload expõe a descarga (null quando não houve)', () => {
    const comDeload = buildReportMetrics({ exercises: [{ name: 'Supino', sets: 2 }], logs: logsComDeload })
    expect(comDeload.deload?.applied).toBe(true)
    const semDeload = buildReportMetrics({ exercises: [{ name: 'Supino', sets: 1 }], logs: { '0-0': { weight: '100', reps: '10', done: true } } })
    expect(semDeload.deload).toBeNull()
  })
})

describe('descarga planejada não é "dia ruim"', () => {
  /**
   * `isBadDay` dispara em −10 % contra a média recente. Uma descarga de 15–22 %
   * passa longe disso — então, sem esta guarda, o relatório acusa queda e o
   * Coach IA escreve que o aluno regrediu no dia em que ele seguiu a orientação
   * do próprio app.
   */
  const sessaoNormal = (vol: number, dias: number) => ({
    date: new Date(Date.UTC(2026, 6, 20 - dias)).toISOString(),
    exercises: [{ name: 'Supino', sets: 1 }],
    logs: { '0-0': { weight: String(vol), reps: '1', done: true } },
  })

  const historico = [sessaoNormal(3000, 2), sessaoNormal(3000, 4), sessaoNormal(3000, 6)]

  it('sessão de descarga não vira isBadDay, e a razão explica', () => {
    const descarga = {
      date: new Date(Date.UTC(2026, 6, 20)).toISOString(),
      exercises: [{ name: 'Supino', sets: 1 }],
      logs: { '0-0': { weight: '2200', reps: '1', done: true, deload: { originalWeight: 3000, suggestedWeight: 2200, reductionPct: 0.22 } } },
    }
    const weekly = buildWeeklyVolumeStats(descarga, historico)
    const flags = buildTrainingLoadFlags(descarga, historico, weekly)
    expect(flags.dayDropPct).toBeLessThan(-10) // a queda existe…
    expect(flags.isBadDay).toBe(false)          // …mas foi planejada
    expect(flags.reason).toMatch(/descarga/i)
  })

  it('queda igual SEM descarga continua sendo dia ruim', () => {
    const ruim = sessaoNormal(2200, 0)
    const weekly = buildWeeklyVolumeStats(ruim, historico)
    const flags = buildTrainingLoadFlags(ruim, historico, weekly)
    expect(flags.isBadDay).toBe(true)
  })

  it('a média de referência ignora sessões de descarga', () => {
    // Sem excluir a descarga da média, a régua desce e a sessão normal seguinte
    // parece um pico — o espelho do mesmo erro.
    const descargaAntiga = {
      date: new Date(Date.UTC(2026, 6, 16)).toISOString(),
      exercises: [{ name: 'Supino', sets: 1 }],
      logs: { '0-0': { weight: '1000', reps: '1', done: true, deload: { originalWeight: 3000, suggestedWeight: 1000, reductionPct: 0.66 } } },
    }
    const atual = sessaoNormal(3000, 0)
    const comDescarga = [...historico, descargaAntiga]
    const weekly = buildWeeklyVolumeStats(atual, comDescarga)
    const flags = buildTrainingLoadFlags(atual, comDescarga, weekly)
    // Média das NORMAIS = 3000 → sessão de 3000 está no padrão (0 %).
    expect(flags.dayDropPct).toBe(0)
  })
})
