import { describe, it, expect } from 'vitest'
import { getSetTag } from '@/utils/report/buildHtml'

describe('getSetTag — rótulo de método no relatório/PDF', () => {
  it('aquecimento / reconhecimento por set_type', () => {
    expect(getSetTag({ set_type: 'warmup' })).toBe('Aquecimento')
    expect(getSetTag({ setType: 'feeler' })).toBe('Reconhecimento')
    expect(getSetTag({ is_warmup: true })).toBe('Aquecimento')
  })

  it('reconhece TODOS os métodos pelos blobs executados', () => {
    expect(getSetTag({ drop_set: { stages: [] } })).toBe('Drop-set')
    expect(getSetTag({ stripping: { stages: [] } })).toBe('Stripping')
    expect(getSetTag({ cluster: { blocks: [] } })).toBe('Cluster')
    expect(getSetTag({ rest_pause: { mini_reps: [] } })).toBe('Rest-pause')
    expect(getSetTag({ fst7: { blocks: [] } })).toBe('FST-7')
    expect(getSetTag({ heavy_duty: {} })).toBe('Heavy Duty')
    expect(getSetTag({ ponto_zero: {} })).toBe('Ponto Zero')
    expect(getSetTag({ forced_reps: {} })).toBe('Rep. Forçadas')
    expect(getSetTag({ negative_reps: {} })).toBe('Rep. Negativas')
    expect(getSetTag({ partial_reps: {} })).toBe('Rep. Parciais')
    expect(getSetTag({ sistema21: {} })).toBe('Sistema 21')
    expect(getSetTag({ wave: { waves: [] } })).toBe('Onda')
  })

  it('override por série (per_set_method) tem precedência, exceto Normal', () => {
    expect(getSetTag({ per_set_method: 'Bi-Set', weight: '80', reps: '8' })).toBe('Bi-Set')
    expect(getSetTag({ per_set_method: 'Normal', weight: '80', reps: '8' })).toBe(null)
  })

  it('config planejada (ainda não executada)', () => {
    expect(getSetTag({ advanced_config: { type: 'dropset' } })).toBe('Drop-set')
    expect(getSetTag({ advanced_config: { kind: 'cluster' } })).toBe('Cluster')
  })

  it('série normal / inválido → null', () => {
    expect(getSetTag({ weight: '80', reps: '8' })).toBe(null)
    expect(getSetTag(null)).toBe(null)
    expect(getSetTag({})).toBe(null)
  })
})
