import { describe, it, expect } from 'vitest'
import { setVolume, setTopWeightReps, parseWeightValue, parseRepsValue, isWorkingSet } from '@/utils/report/setVolume'

describe('parseWeightValue / parseRepsValue', () => {
  it('trata vírgula decimal e inválidos', () => {
    expect(parseWeightValue('28,5')).toBe(28.5)
    expect(parseWeightValue('')).toBe(0)
    expect(parseWeightValue(null)).toBe(0)
    expect(parseWeightValue('abc')).toBe(0)
    expect(parseWeightValue(40)).toBe(40)
  })

  it('reps: trata formato feito/planejado "8/10" → 8', () => {
    expect(parseRepsValue('8/10')).toBe(8)
    expect(parseRepsValue('12')).toBe(12)
    expect(parseRepsValue('')).toBe(0)
  })
})

describe('setVolume', () => {
  it('série normal: peso × reps', () => {
    expect(setVolume({ weight: '100', reps: '10' })).toBe(1000)
    expect(setVolume({ weight: '28,5', reps: '12' })).toBe(342)
  })

  it('unilateral: soma os dois lados (L + R)', () => {
    // 20kg×12 cada lado = 240 + 240 = 480
    expect(setVolume({ L_weight: '20', L_reps: '12', R_weight: '20', R_reps: '12' })).toBe(480)
  })

  it('unilateral com pesos diferentes por lado', () => {
    expect(setVolume({ L_weight: '22', L_reps: '10', R_weight: '20', R_reps: '10' })).toBe(420)
  })

  it('unilateral com só um lado preenchido', () => {
    expect(setVolume({ L_weight: '15', L_reps: '10' })).toBe(150)
  })

  it('cluster tem prioridade e soma os blocks', () => {
    const log = { cluster: { blocks: [{ weight: '50', reps: '5' }, { weight: '50', reps: '5' }] } }
    expect(setVolume(log)).toBe(500)
  })

  it('logs vazios/ inválidos → 0', () => {
    expect(setVolume(null)).toBe(0)
    expect(setVolume({})).toBe(0)
    expect(setVolume({ weight: '0', reps: '0' })).toBe(0)
  })
})

describe('setTopWeightReps', () => {
  it('normal: pega weight/reps do topo', () => {
    expect(setTopWeightReps({ weight: '80', reps: '8' })).toEqual({ weight: 80, reps: 8 })
  })

  it('unilateral: cai pro lado L quando topo vazio', () => {
    expect(setTopWeightReps({ L_weight: '20', L_reps: '12', R_weight: '20', R_reps: '12' }))
      .toEqual({ weight: 20, reps: 12 })
  })

  it('unilateral só com lado R', () => {
    expect(setTopWeightReps({ R_weight: '18', R_reps: '10' })).toEqual({ weight: 18, reps: 10 })
  })

  it('vazio → 0/0', () => {
    expect(setTopWeightReps({})).toEqual({ weight: 0, reps: 0 })
    expect(setTopWeightReps(null)).toEqual({ weight: 0, reps: 0 })
  })
})

describe('isWorkingSet', () => {
  it('série de trabalho padrão conta (sem set_type, done implícito)', () => {
    expect(isWorkingSet({ weight: '80', reps: '8' })).toBe(true)
  })

  it('aquecimento e feeler NÃO contam', () => {
    expect(isWorkingSet({ set_type: 'warmup', weight: '40', reps: '10' })).toBe(false)
    expect(isWorkingSet({ setType: 'feeler', weight: '40', reps: '10' })).toBe(false)
    expect(isWorkingSet({ is_warmup: true, weight: '40', reps: '10' })).toBe(false)
    expect(isWorkingSet({ isWarmup: true, weight: '40', reps: '10' })).toBe(false)
  })

  it('série marcada como não feita NÃO conta', () => {
    expect(isWorkingSet({ done: false, weight: '80', reps: '8' })).toBe(false)
    expect(isWorkingSet({ completed: 'false', weight: '80', reps: '8' })).toBe(false)
  })

  it('done explícito e set_type working contam', () => {
    expect(isWorkingSet({ done: true, set_type: 'working', weight: '80', reps: '8' })).toBe(true)
    expect(isWorkingSet({ isDone: true, weight: '80', reps: '8' })).toBe(true)
  })

  it('inválido → false', () => {
    expect(isWorkingSet(null)).toBe(false)
    expect(isWorkingSet('nope')).toBe(false)
  })
})
