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
