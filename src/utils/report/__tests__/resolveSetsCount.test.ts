import { describe, it, expect } from 'vitest'
import { resolveReportSetsCount } from '@/utils/report/resolveSetsCount'

describe('resolveReportSetsCount', () => {
  it('usa exercise.sets quando presente', () => {
    expect(resolveReportSetsCount({ sets: 4 }, 0, {})).toBe(4)
  })

  it('BUG unilateral: sets ausente + logs L_/R_ → conta pelos logs (antes zerava)', () => {
    const logs = {
      '1-0': { L_weight: '40', L_reps: '10', R_weight: '40', R_reps: '10' },
      '1-1': { L_weight: '40', L_reps: '9', R_weight: '40', R_reps: '9' },
      '1-2': { L_weight: '40', L_reps: '8', R_weight: '40', R_reps: '8' },
    }
    expect(resolveReportSetsCount({ name: 'Flexora em pé' }, 1, logs)).toBe(3)
  })

  it('cai em setDetails.length quando sets ausente', () => {
    expect(resolveReportSetsCount({ setDetails: [{}, {}, {}] }, 0, {})).toBe(3)
  })

  it('pega o MAIOR entre sets, setDetails e logs', () => {
    const logs = { '0-0': {}, '0-1': {}, '0-2': {}, '0-3': {} }
    expect(resolveReportSetsCount({ sets: 2, setDetails: [{}, {}, {}] }, 0, logs)).toBe(4)
  })

  it('não confunde exercícios com índice de prefixo parecido (1 vs 10)', () => {
    const logs = { '1-0': {}, '10-0': {}, '10-1': {} }
    expect(resolveReportSetsCount({}, 1, logs)).toBe(1)
    expect(resolveReportSetsCount({}, 10, logs)).toBe(2)
  })

  it('ignora sub-chaves não numéricas', () => {
    const logs = { '0-0': {}, '0-note': {} }
    expect(resolveReportSetsCount({}, 0, logs)).toBe(1)
  })

  it('entrada inválida → 0', () => {
    expect(resolveReportSetsCount(null, 0, null)).toBe(0)
  })
})
