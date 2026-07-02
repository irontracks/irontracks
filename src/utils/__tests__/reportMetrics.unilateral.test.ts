import { describe, it, expect } from 'vitest'
import { buildReportMetrics } from '@/utils/report/reportMetrics'

/**
 * Regressão do bug "volume zera com exercícios unilaterais": o relatório de
 * finalização somava só weight/reps do topo, e unilaterais (L_/R_) e clusters
 * gravam em outros campos → contavam 0 kg. Agora usa a fonte única setVolume.
 */
describe('buildReportMetrics — volume unilateral e cluster', () => {
  it('agachamento búlgaro 4×(20×10/lado) = 1600 kg, não 0', () => {
    const uni = { L_weight: '20', L_reps: '10', R_weight: '20', R_reps: '10', done: true }
    const session = {
      exercises: [{ name: 'Agachamento Búlgaro', sets: 4 }],
      logs: { '0-0': uni, '0-1': uni, '0-2': uni, '0-3': uni },
    }
    const m = buildReportMetrics(session)
    expect(m.totals.volumeKg).toBe(1600)
    expect(m.exercises[0].volumeKg).toBe(1600)
  })

  it('cluster soma os blocks', () => {
    const session = {
      exercises: [{ name: 'Barra Fixa Cluster', sets: 1 }],
      logs: {
        '0-0': { cluster: { blocks: [{ weight: '50', reps: '5' }, { weight: '50', reps: '5' }] }, done: true },
      },
    }
    const m = buildReportMetrics(session)
    expect(m.totals.volumeKg).toBe(500)
  })

  it('aquecimento não entra no volume; série normal entra', () => {
    const session = {
      exercises: [{ name: 'Supino', sets: 3 }],
      logs: {
        '0-0': { set_type: 'warmup', weight: '40', reps: '10', done: true },
        '0-1': { weight: '80', reps: '10', done: true },
        '0-2': { weight: '80', reps: '10', done: true },
      },
    }
    const m = buildReportMetrics(session)
    // Só as 2 séries de trabalho: 2 × 800 = 1600 (aquecimento 400 fora)
    expect(m.totals.volumeKg).toBe(1600)
  })
})

/**
 * Regressão do item 9: o Δ1RM comparava o 1RM do dia calculado por MÉDIA
 * (peso médio × reps médias) contra o melhor 1RM histórico → Δ falsamente
 * negativo. Agora o relatório expõe bestE1rm = MÁXIMO por série.
 */
describe('buildReportMetrics — bestE1rm (máx por série)', () => {
  it('usa a melhor série, não a média', () => {
    const session = {
      exercises: [{ name: 'Supino', sets: 3 }],
      logs: {
        '0-0': { weight: '100', reps: '5', done: true },
        '0-1': { weight: '80', reps: '8', done: true },
        '0-2': { weight: '60', reps: '10', done: true },
      },
    }
    const m = buildReportMetrics(session)
    // Melhor set 100×5 → 100×(1+5/30) = 116,67 → 116,7 (média daria ~100,4)
    expect(m.exercises[0].bestE1rm).toBe(116.7)
  })

  it('unilateral: 1RM por lado (não soma L+R)', () => {
    const session = {
      exercises: [{ name: 'Agachamento Búlgaro', sets: 1 }],
      logs: { '0-0': { L_weight: '22', L_reps: '10', R_weight: '22', R_reps: '10', done: true } },
    }
    const m = buildReportMetrics(session)
    // 22×(1+10/30) = 29,33 → 29,3
    expect(m.exercises[0].bestE1rm).toBe(29.3)
  })

  it('sem carga válida (só prancha) → bestE1rm null', () => {
    const session = {
      exercises: [{ name: 'Prancha', sets: 1 }],
      logs: { '0-0': { durationSeconds: '60', done: true } },
    }
    const m = buildReportMetrics(session)
    expect(m.exercises[0].bestE1rm).toBeNull()
  })
})
