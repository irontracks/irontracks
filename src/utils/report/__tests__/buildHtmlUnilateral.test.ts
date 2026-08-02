import { describe, it, expect } from 'vitest'
import { buildReportHTML } from '@/utils/report/buildHtml'

// Guard do bug do unilateral no PDF/compartilhamento (paralelo do relatório React):
// exercício unilateral sem `sets` (config em setDetails/logs L_/R_) fazia a tabela
// do exercício sair VAZIA no HTML exportado. resolveReportSetsCount conta pelos logs.
describe('buildReportHTML — unilateral não some da tabela (guard)', () => {
  const uniSession = {
    workoutTitle: 'Lower Unilateral',
    // Sem `sets` de propósito — unilateral guarda a config fora de `sets`.
    exercises: [{ name: 'Flexora em pé' }],
    logs: {
      '0-0': { L_weight: '40', L_reps: '10', R_weight: '40', R_reps: '10', done: true },
      '0-1': { L_weight: '42', L_reps: '9', R_weight: '42', R_reps: '9', done: true },
      '0-2': { L_weight: '44', L_reps: '8', R_weight: '44', R_reps: '8', done: true },
    },
    reportMeta: {},
  }
  const html = buildReportHTML(uniSession, null, 'Usuário', 500, {})

  it('inclui o exercício e os pesos das séries (antes vinha vazio)', () => {
    expect(html).toContain('Flexora em pé')
    // pesos por lado (setTopWeightReps) precisam aparecer → prova que as linhas renderizaram
    expect(html).toContain('40')
    expect(html).toContain('42')
    expect(html).toContain('44')
  })
})
