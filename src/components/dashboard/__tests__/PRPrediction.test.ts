import { describe, it, expect } from 'vitest'
import { predictWeeksToTarget } from '@/components/dashboard/PRPrediction'

/**
 * Regressão do bug "~NaN semanas": a regressão linear dividia por zero quando
 * todos os registros tinham a MESMA data (denominador = n·Σx² − (Σx)² = 0),
 * gerando slope NaN. O guard "slope <= 0" não pega NaN → aparecia "~NaN semanas".
 */
describe('predictWeeksToTarget', () => {
  it('datas iguais → null (não "~NaN semanas")', () => {
    const hist = [
      { date: '2026-06-30', weight: 100 },
      { date: '2026-06-30', weight: 100 },
      { date: '2026-06-30', weight: 100 },
    ]
    expect(predictWeeksToTarget(hist, 110)).toBeNull()
  })

  it('progressão linear real → previsão finita', () => {
    const hist = [
      { date: '2026-06-01', weight: 100 },
      { date: '2026-06-08', weight: 102 },
      { date: '2026-06-15', weight: 104 },
    ]
    const r = predictWeeksToTarget(hist, 110)
    expect(r).not.toBeNull()
    expect(Number.isFinite(r!.weeks)).toBe(true)
    expect(r!.weeks).toBeGreaterThan(0)
  })

  it('sem progressão (slope <= 0) → null', () => {
    const hist = [
      { date: '2026-06-01', weight: 104 },
      { date: '2026-06-08', weight: 102 },
      { date: '2026-06-15', weight: 100 },
    ]
    expect(predictWeeksToTarget(hist, 110)).toBeNull()
  })
})
