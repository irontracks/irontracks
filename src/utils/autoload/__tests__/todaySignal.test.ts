/**
 * Calibração da carga pela SÉRIE DE RECONHECIMENTO de hoje.
 *
 * Regra de produto (dono, 2026-07-29): o autopreenchimento continua tendo a
 * chavinha global de liga/desliga, e mesmo ligado a calibração só age quando o
 * usuário marca a série como "Reconhecimento" E preenche o RPE. Opt-in duplo.
 *
 * Fundamento: o histórico projeta a força da última sessão; o reconhecimento mede
 * a de hoje. Uma medida vale mais que uma projeção — mas RPE longe da falha é
 * impreciso, então o sinal é limitado (0,90–1,05) e, com RIR alto, só amortece.
 */
import { describe, it, expect } from 'vitest'
import { suggestWeight, usableTodaySignal, type HistorySet } from '@/utils/autoload/suggestWeight'

/** Última sessão: 130 kg × 8 @ RPE 9 (e1RM ≈ 169 kg) — o exemplo do dono. */
const HIST: HistorySet[] = [{ weight: 130, reps: 8, rpe: 9 }]
const ALVO = { targetReps: 8, targetRpe: 8, equipment: ['barbell'] as const }

describe('usableTodaySignal — exige peso, reps E rpe', () => {
  it('aceita o sinal completo', () => {
    expect(usableTodaySignal({ weight: 120, reps: 6, rpe: 7 })).not.toBeNull()
  })

  it('rejeita sem RPE (o opt-in do dono)', () => {
    expect(usableTodaySignal({ weight: 120, reps: 6, rpe: null })).toBeNull()
  })

  it('rejeita sem reps ou sem peso', () => {
    expect(usableTodaySignal({ weight: 120, reps: 0, rpe: 7 })).toBeNull()
    expect(usableTodaySignal({ weight: 0, reps: 6, rpe: 7 })).toBeNull()
  })

  it('rejeita nulo/ausente', () => {
    expect(usableTodaySignal(null)).toBeNull()
    expect(usableTodaySignal(undefined)).toBeNull()
  })
})

describe('sem sinal do dia — comportamento inalterado', () => {
  it('mantém a carga anterior (trava anti-regressão ativa)', () => {
    const s = suggestWeight({ history: HIST, ...ALVO })
    expect(s.weight).toBe(130)
  })
})

describe('com sinal do dia', () => {
  it('dia RUIM: reconhecimento fraco reduz a carga, suspendendo a trava anti-regressão', () => {
    // 120×6 @RPE7 → e1RM ≈ 156 → fator ≈ 0,92
    const s = suggestWeight({ history: HIST, ...ALVO, todaySignal: { weight: 120, reps: 6, rpe: 7 } })
    expect(s.weight).toBeLessThan(130)
    expect(s.weight).toBeGreaterThan(0)
    expect(s.rationale).toContain('reconhecimento de hoje')
  })

  it('nunca reduz além do piso de 10%', () => {
    // sinal absurdamente fraco: o clamp tem que segurar
    const s = suggestWeight({ history: HIST, ...ALVO, todaySignal: { weight: 40, reps: 3, rpe: 10 } })
    expect(s.weight).toBeGreaterThanOrEqual(130 * 0.9 * 0.9)
  })

  it('dia BOM com RPE confiável: pode subir', () => {
    // 130×8 @RPE6 (sobrou) → e1RM ≈ 147... na verdade maior que o histórico @RPE9
    const s = suggestWeight({ history: HIST, ...ALVO, todaySignal: { weight: 135, reps: 8, rpe: 7 } })
    expect(s.weight).toBeGreaterThanOrEqual(130)
  })

  it('RIR alto (RPE baixo) só amortece — nunca empurra peso', () => {
    // RPE 4 → RIR 6 (≥ UNRELIABLE_RIR): estimativa ruim, teto do fator = 1
    const s = suggestWeight({ history: HIST, ...ALVO, todaySignal: { weight: 150, reps: 10, rpe: 4 } })
    expect(s.weight).toBeLessThanOrEqual(130)
  })

  it('respeita o teto de +10% por sessão mesmo num dia excelente', () => {
    const s = suggestWeight({ history: HIST, ...ALVO, todaySignal: { weight: 160, reps: 10, rpe: 8 } })
    expect(s.weight).toBeLessThanOrEqual(130 * 1.1)
  })

  it('sem RPE, o sinal é ignorado e a carga não muda', () => {
    const s = suggestWeight({ history: HIST, ...ALVO, todaySignal: { weight: 90, reps: 5, rpe: null } })
    expect(s.weight).toBe(130)
    expect(s.rationale).not.toContain('reconhecimento')
  })
})

describe('cold start — exercício sem histórico', () => {
  it('SEM reconhecimento continua sem sugerir, mas explica o que fazer', () => {
    const s = suggestWeight({ history: [], ...ALVO })
    expect(s.weight).toBeNull()
    expect(s.rationale).toContain('Reconhecimento')
    expect(s.rationale).toContain('RPE')
  })

  it('COM reconhecimento passa a sugerir na estreia do exercício', () => {
    const s = suggestWeight({ history: [], ...ALVO, todaySignal: { weight: 100, reps: 10, rpe: 7 } })
    expect(s.weight).toBeGreaterThan(0)
    expect(s.confidence).toBe('medium')
    expect(s.rationale).toContain('reconhecimento de hoje')
  })
})
