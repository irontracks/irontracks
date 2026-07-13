import { describe, it, expect } from 'vitest'
import { editedSetDetails, advancedConfigOf, stripMethodBlobs } from '../editedSetDetails'

const dropCfg = [{ weight: '30', reps: 10 }, { weight: '20', reps: 8 }]

describe('advancedConfigOf', () => {
  it('lê advanced_config ou advancedConfig', () => {
    expect(advancedConfigOf({ advanced_config: dropCfg })).toBe(dropCfg)
    expect(advancedConfigOf({ advancedConfig: dropCfg })).toBe(dropCfg)
    expect(advancedConfigOf({})).toBe(null)
    expect(advancedConfigOf(null)).toBe(null)
  })
})

describe('editedSetDetails — troca de método limpa config fantasma', () => {
  it('método inalterado: preserva advanced_config das séries existentes', () => {
    const sd = [{ set_number: 1, advanced_config: dropCfg }, { set_number: 2, advanced_config: dropCfg }]
    const out = editedSetDetails(sd, 2, false)
    expect(out[0].advanced_config).toBe(dropCfg)
    expect(out[1].advanced_config).toBe(dropCfg)
  })

  it('troca de método: zera advanced_config das séries existentes (mata o fantasma)', () => {
    const sd = [{ set_number: 1, advanced_config: dropCfg }, { set_number: 2, advancedConfig: dropCfg }]
    const out = editedSetDetails(sd, 2, true)
    expect(out[0].advanced_config).toBe(null)
    expect(out[1].advanced_config).toBe(null)
    expect(out[1].advancedConfig).toBe(null)
  })

  it('preserva peso/reps já registrados na série (só limpa a config do método)', () => {
    const sd = [{ set_number: 1, weight: 80, reps: '8', advanced_config: dropCfg }]
    const out = editedSetDetails(sd, 1, true)
    expect(out[0].weight).toBe(80)
    expect(out[0].reps).toBe('8')
    expect(out[0].advanced_config).toBe(null)
  })
})

describe('stripMethodBlobs — troca de método limpa o log executado', () => {
  it('remove os blobs de método mas preserva weight/reps/done/set_type', () => {
    const log = {
      weight: '80', reps: '8', done: true, set_type: 'working',
      fst7: { blocks: [1, 2, 3] }, drop_set: { stages: [] }, cluster: {}, per_set_method: 'Cluster',
    }
    const out = stripMethodBlobs(log) as Record<string, unknown>
    expect(out.weight).toBe('80')
    expect(out.reps).toBe('8')
    expect(out.done).toBe(true)
    expect(out.set_type).toBe('working')
    expect('fst7' in out).toBe(false)
    expect('drop_set' in out).toBe(false)
    expect('cluster' in out).toBe(false)
    expect('per_set_method' in out).toBe(false)
  })

  it('log sem blob volta igual (mesma referência)', () => {
    const log = { weight: '80', reps: '8', done: true }
    expect(stripMethodBlobs(log)).toBe(log)
  })

  it('não-objeto volta como veio', () => {
    expect(stripMethodBlobs(null)).toBe(null)
    expect(stripMethodBlobs('x')).toBe('x')
  })
})

describe('editedSetDetails — herança na série nova', () => {
  it('aumentar séries com mesmo método: série nova HERDA o config (reps zeradas)', () => {
    const sd = [{ set_number: 1, advanced_config: dropCfg }, { set_number: 2, advanced_config: dropCfg }, { set_number: 3, advanced_config: dropCfg }]
    const out = editedSetDetails(sd, 4, false) // 3 → 4 séries
    expect(out).toHaveLength(4)
    // série 4 herda 2 estágios, reps zeradas
    expect(Array.isArray(out[3].advanced_config)).toBe(true)
    const stages = out[3].advanced_config as Array<Record<string, unknown>>
    expect(stages).toHaveLength(2)
    expect(stages[0].weight).toBe('30')
    expect(stages[0].reps).toBe('')
  })

  it('aumentar séries COM troca de método: série nova NÃO herda (config null)', () => {
    const sd = [{ set_number: 1, advanced_config: dropCfg }]
    const out = editedSetDetails(sd, 2, true)
    expect(out[1].advanced_config).toBe(null)
  })

  it('exercício Normal (sem config): série nova continua null', () => {
    const sd = [{ set_number: 1, weight: 50, reps: '10' }]
    const out = editedSetDetails(sd, 2, false)
    expect(out[1].advanced_config).toBe(null)
  })

  it('reduzir séries: mantém só as N primeiras', () => {
    const sd = [{ set_number: 1 }, { set_number: 2 }, { set_number: 3 }]
    const out = editedSetDetails(sd, 2, false)
    expect(out).toHaveLength(2)
    expect(out[0].set_number).toBe(1)
    expect(out[1].set_number).toBe(2)
  })
})
