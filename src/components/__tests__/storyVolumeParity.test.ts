import { describe, it, expect } from 'vitest'
import { calculateTotalVolume as storyVolume } from '@/components/storyComposerUtils'
import { calculateTotalVolume as canonicalVolume } from '@/utils/report/formatters'

// Caso REAL (treino UPPER A, 14/07): o Crucifixo é drop-set com etapas 57kg → 36kg.
// O log grava no topo weight=36 (última etapa) e reps=soma. A versão do Story
// somava `weight × reps` do topo → 36×30 = 1080 em vez de 57×15 + 36×15 = 1395.
// No treino inteiro isso dava 18.856 kg no Story vs 19.696 kg reais (−840 kg).
const dropLogs = {
  '3-0': { done: true, weight: '36', reps: '30', drop_set: { stages: [{ weight: '57', reps: 15 }, { weight: '36', reps: 15 }] } },
  '3-1': { done: true, weight: '36', reps: '25', drop_set: { stages: [{ weight: '57', reps: 15 }, { weight: '36', reps: 10 }] } },
  '3-2': { done: true, weight: '36', reps: '20', drop_set: { stages: [{ weight: '57', reps: 10 }, { weight: '36', reps: 10 }] } },
}

describe('volume do Story — paridade com a fonte única', () => {
  it('soma as ETAPAS do drop (3.540), não o topo do log (2.700)', () => {
    expect(storyVolume(dropLogs)).toBe(3540)
    expect(storyVolume(dropLogs)).not.toBe(2700) // o número subcontado de antes
  })

  it('bate exatamente com a canônica (relatório/histórico)', () => {
    expect(storyVolume(dropLogs)).toBe(canonicalVolume(dropLogs))
  })

  it('unilateral (só L_/R_) não zera mais', () => {
    const uni = { '0-0': { done: true, L_weight: '40', L_reps: '10', R_weight: '40', R_reps: '10' } }
    expect(storyVolume(uni)).toBe(800) // 40×10 + 40×10
    expect(storyVolume(uni)).toBe(canonicalVolume(uni))
  })

  it('aquecimento não conta (igual ao relatório)', () => {
    const withWarmup = {
      '0-0': { done: true, weight: '100', reps: '10', set_type: 'warmup' },
      '0-1': { done: true, weight: '100', reps: '10' },
    }
    expect(storyVolume(withWarmup)).toBe(1000) // só a série de trabalho
    expect(storyVolume(withWarmup)).toBe(canonicalVolume(withWarmup))
  })

  it('mantém o formato "feito/planejado" das reps ("8/10" → 8)', () => {
    const logs = { '0-0': { done: true, weight: '50', reps: '8/10' } }
    expect(storyVolume(logs)).toBe(400)
  })
})
