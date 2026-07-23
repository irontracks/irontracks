import { describe, it, expect } from 'vitest'
import { suggestWeight, estimateE1RM, readinessFactor } from '../suggestWeight'

describe('estimateE1RM', () => {
  it('Epley ajustado por RPE: 80kg x 8 @ RPE8 ≈ 106,7 (2 na reserva)', () => {
    const e = estimateE1RM({ weight: 80, reps: 8, rpe: 8 })!
    expect(e).toBeCloseTo(80 * (1 + 10 / 30), 1) // effReps = 8 + 2
  })

  it('sem RPE assume RIR 1 (quase-máxima, não superestima)', () => {
    const e = estimateE1RM({ weight: 100, reps: 5, rpe: null })!
    expect(e).toBeCloseTo(100 * (1 + 6 / 30), 1)
  })

  it('RPE10 (falha) = sem reps na reserva', () => {
    const e = estimateE1RM({ weight: 100, reps: 5, rpe: 10 })!
    expect(e).toBeCloseTo(100 * (1 + 5 / 30), 1)
  })

  it('entrada inválida → null', () => {
    expect(estimateE1RM({ weight: 0, reps: 8, rpe: 8 })).toBeNull()
    expect(estimateE1RM({ weight: 80, reps: 0, rpe: 8 })).toBeNull()
  })
})

describe('readinessFactor', () => {
  it('sem prontidão → 1.0', () => {
    expect(readinessFactor(undefined).factor).toBe(1)
  })
  it('sono curto + dor alta amortecem, com piso de segurança', () => {
    const { factor } = readinessFactor({ sleepHours: 4, soreness: 8 })
    expect(factor).toBeGreaterThanOrEqual(0.88)
    expect(factor).toBeLessThan(1)
  })
  it('dia bom não altera', () => {
    expect(readinessFactor({ sleepHours: 8, soreness: 0, energy: 5 }).factor).toBe(1)
  })
  it('nunca passa de 1 (só amortece)', () => {
    expect(readinessFactor({ sleepHours: 12, soreness: 0, energy: 5 }).factor).toBe(1)
  })
})

describe('suggestWeight', () => {
  const base = { targetReps: 8, targetRpe: 8, equipment: ['barra'] }

  it('progride quando a última série sobrou (RPE baixo)', () => {
    // 80kg x 8 @ RPE6 → sobrou muito → deve subir acima de 80
    const s = suggestWeight({ ...base, history: [{ weight: 80, reps: 8, rpe: 6 }] })
    expect(s.weight).toBeGreaterThan(80)
    expect(s.weight! % 2.5).toBe(0) // arredondado ao passo da barra
    expect(s.confidence).toBe('high')
  })

  it('não regride num dia normal (âncora na maior carga)', () => {
    const s = suggestWeight({ ...base, history: [{ weight: 80, reps: 8, rpe: 9 }] })
    expect(s.weight).toBeGreaterThanOrEqual(80)
  })

  it('respeita a trava de salto (máx +10%)', () => {
    // RPE muito baixo tentaria saltar muito; clampa em 80*1.1=88 → arredonda p/ baixo
    const s = suggestWeight({ ...base, history: [{ weight: 80, reps: 5, rpe: 4 }] })
    expect(s.weight).toBeLessThanOrEqual(88)
  })

  it('série à falha na última vez → não progride', () => {
    const s = suggestWeight({ ...base, history: [{ weight: 80, reps: 8, rpe: 10, failed: true }] })
    expect(s.weight).toBe(80)
  })

  it('dia ruim (sono/dor) reduz a carga', () => {
    const bom = suggestWeight({ ...base, history: [{ weight: 100, reps: 8, rpe: 8 }] })
    const ruim = suggestWeight({ ...base, history: [{ weight: 100, reps: 8, rpe: 8 }], readiness: { sleepHours: 4, soreness: 8 } })
    expect(ruim.weight!).toBeLessThan(bom.weight!)
  })

  it('arredonda ao equipamento (halteres passo 2)', () => {
    const s = suggestWeight({ ...base, equipment: ['halteres'], history: [{ weight: 20, reps: 8, rpe: 6 }] })
    expect(s.weight! % 2).toBe(0)
  })

  it('peso corporal / elástico → sem kg, progride por reps', () => {
    const s = suggestWeight({ ...base, equipment: ['peso_corporal'], history: [{ weight: 0, reps: 12, rpe: 8 }] })
    expect(s.weight).toBeNull()
    expect(s.rationale).toMatch(/repeti/i)
  })

  it('sem histórico → weight null (calibração)', () => {
    const s = suggestWeight({ ...base, history: [] })
    expect(s.weight).toBeNull()
    expect(s.confidence).toBe('low')
    expect(s.rationale).toMatch(/calibr/i)
  })

  it('substituto → confiança baixa e não passa da âncora do substituto', () => {
    const s = suggestWeight({ ...base, history: [{ weight: 80, reps: 8, rpe: 5 }], fromSubstitute: true })
    expect(s.confidence).toBe('low')
    expect(s.weight!).toBeLessThanOrEqual(80)
  })

  it('sem RPE no histórico → confiança média', () => {
    const s = suggestWeight({ ...base, history: [{ weight: 80, reps: 8, rpe: null }] })
    expect(s.confidence).toBe('medium')
  })

  it('rationale explica a decisão de forma legível', () => {
    const s = suggestWeight({ ...base, history: [{ weight: 80, reps: 8, rpe: 7 }] })
    expect(s.rationale).toMatch(/Última vez/i)
    expect(typeof s.weight).toBe('number')
  })
})
