import { describe, it, expect } from 'vitest'
import { formatSetStages } from '@/utils/report/formatStages'
import { setBestE1rm } from '@/utils/report/setVolume'

// Caso real reportado: drop de 57kg → 36kg. O log grava no topo weight=36 (última
// etapa) e reps=30 (soma), escondendo o 57. As etapas reais vivem em drop_set.stages.
const dropLog = {
  done: true,
  weight: '36',        // última etapa (a mais leve)
  reps: '30',          // soma das reps
  drop_set: {
    stages: [
      { weight: '57', reps: 12 },
      { weight: '36', reps: 18 },
    ],
  },
}

describe('formatSetStages', () => {
  it('recupera as etapas do drop (57 → 36), não só o menor peso', () => {
    const s = formatSetStages(dropLog)
    expect(s).not.toBeNull()
    expect(s!.weights).toBe('57 → 36')
    expect(s!.reps).toBe('12 → 18')
    expect(s!.count).toBe(2)
  })

  it('funciona para stripping (mesma estrutura de stages)', () => {
    const strip = { stripping: { stages: [{ weight: 50, reps: 10 }, { weight: 40, reps: 8 }, { weight: 30, reps: 6 }] } }
    const s = formatSetStages(strip)
    expect(s!.weights).toBe('50 → 40 → 30')
    expect(s!.reps).toBe('10 → 8 → 6')
  })

  it('série normal (sem etapas) → null', () => {
    expect(formatSetStages({ weight: '80', reps: '10' })).toBeNull()
  })

  it('uma etapa só não é drop → null', () => {
    expect(formatSetStages({ drop_set: { stages: [{ weight: 50, reps: 10 }] } })).toBeNull()
  })

  it('entrada inválida → null', () => {
    expect(formatSetStages(null)).toBeNull()
  })
})

describe('1RM do drop deve vir da MELHOR etapa (não do menor peso × total)', () => {
  it('setBestE1rm usa a etapa de 57kg, não 36kg × 30 reps', () => {
    // Errado (o que o relatório fazia): Epley(36, 30) = 36 * (1 + 30/30) = 72 kg
    // Certo: melhor etapa = Epley(57, 12) = 57 * (1 + 12/30) = 79.8 kg
    const best = setBestE1rm(dropLog)
    expect(Math.round(best * 10) / 10).toBe(79.8)
    expect(best).not.toBe(72) // o número inflado/enganoso de antes
  })
})
