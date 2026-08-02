import { describe, it, expect } from 'vitest'
import { calculateTotalVolume } from '@/utils/report/formatters'

/**
 * Regressão: o volume do Story/relatório (formatters.calculateTotalVolume) tinha
 * uma cópia local de `isWorkingSet` que NÃO checava `done` — então contava séries
 * não-concluídas, enquanto o histórico e o PDF (que usam a de setVolume.ts) as
 * excluíam. Mesmo treino → número diferente. Agora todos usam a mesma regra.
 */
describe('volume — série não-concluída não conta (paridade com histórico/PDF)', () => {
  it('exclui a série com done=false', () => {
    const logs = {
      '0-0': { done: true, weight: '100', reps: '10' },
      '0-1': { done: false, weight: '100', reps: '10' }, // marcada mas não feita
    }
    expect(calculateTotalVolume(logs)).toBe(1000) // só a concluída
  })

  it('done ausente é tratado como concluído (compat com logs antigos)', () => {
    const logs = { '0-0': { weight: '80', reps: '10' } }
    expect(calculateTotalVolume(logs)).toBe(800)
  })

  it('aquecimento continua fora, concluído ou não', () => {
    const logs = {
      '0-0': { done: true, weight: '100', reps: '10', set_type: 'warmup' },
      '0-1': { done: true, weight: '100', reps: '10' },
    }
    expect(calculateTotalVolume(logs)).toBe(1000)
  })
})
