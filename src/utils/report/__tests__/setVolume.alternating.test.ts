import { describe, it, expect } from 'vitest'
import { setVolume, setTotalReps, setBestE1rm } from '../setVolume'
import { buildReportMetrics } from '../reportMetrics'

/**
 * Modo "Alternado" (ex.: rosca alternada): 1 registro, mesmo peso, mas os DOIS
 * braços fazem as reps. O renderer grava `alternating: true` no log; volume e
 * reps totais dobram. 1RM e peso de display NÃO dobram (são por lado).
 *
 * De quebra, valida a correção do unilateral: setTotalReps soma L+R (antes o
 * relatório contava reps de um lado só).
 */
describe('setVolume — alternado', () => {
  it('alternado 10kg×10 = 200 (dobra os dois lados)', () => {
    expect(setVolume({ weight: '10', reps: '10', alternating: true })).toBe(200)
  })

  it('sem a flag, 10kg×10 = 100 (série normal não dobra)', () => {
    expect(setVolume({ weight: '10', reps: '10' })).toBe(100)
  })

  it('alternating:false explícito não dobra', () => {
    expect(setVolume({ weight: '10', reps: '10', alternating: false })).toBe(100)
  })

  it('unilateral (L_/R_) segue somando L+R, alheio à flag alternating', () => {
    expect(setVolume({ L_weight: '20', L_reps: '10', R_weight: '20', R_reps: '10' })).toBe(400)
  })
})

describe('setTotalReps', () => {
  it('alternado: reps × 2', () => {
    expect(setTotalReps({ reps: '10', alternating: true })).toBe(20)
  })
  it('normal: reps', () => {
    expect(setTotalReps({ reps: '10' })).toBe(10)
  })
  it('unilateral: L_reps + R_reps (corrige a subcontagem antiga)', () => {
    expect(setTotalReps({ L_reps: '10', R_reps: '8' })).toBe(18)
  })
})

describe('setBestE1rm — alternado NÃO dobra (1RM é por lado)', () => {
  it('alternado 20kg×10 → Epley por lado = 26,7 (não usa o dobro)', () => {
    // 20 × (1 + 10/30) = 26,666… ; o setVolume dobraria o VOLUME, não o 1RM.
    expect(setBestE1rm({ weight: '20', reps: '10', alternating: true })).toBeCloseTo(26.666, 2)
  })
})

describe('buildReportMetrics — sessão com exercício alternado', () => {
  it('rosca alternada 3×(12kg×10) = 720 kg de volume e 60 reps', () => {
    const alt = { weight: '12', reps: '10', alternating: true, done: true }
    const session = {
      exercises: [{ name: 'Rosca Alternada', sets: 3, is_alternating: true }],
      logs: { '0-0': alt, '0-1': alt, '0-2': alt },
    }
    const m = buildReportMetrics(session)
    // Volume: 3 × (12×10×2) = 720. Reps: 3 × (10×2) = 60.
    expect(m.totals.volumeKg).toBe(720)
    expect(m.totals.repsDone).toBe(60)
    // Peso médio de display continua 12 (por braço), não 24.
    expect(m.exercises[0].avgWeightKg).toBe(12)
  })

  it('mesma carga SEM a flag conta metade (prova que a flag é o que dobra)', () => {
    const normal = { weight: '12', reps: '10', done: true }
    const session = {
      exercises: [{ name: 'Rosca Direta', sets: 3 }],
      logs: { '0-0': normal, '0-1': normal, '0-2': normal },
    }
    const m = buildReportMetrics(session)
    expect(m.totals.volumeKg).toBe(360)
    expect(m.totals.repsDone).toBe(30)
  })
})
