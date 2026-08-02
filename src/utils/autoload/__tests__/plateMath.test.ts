import { describe, it, expect } from 'vitest'
import { resolveIncrement, roundToIncrement, roundSuggestedWeight } from '../plateMath'

describe('resolveIncrement', () => {
  it('barra usa passo de 2,5 kg (anilhas de 1,25 por lado)', () => {
    expect(resolveIncrement(['barra'])).toEqual({ increment: 2.5, equipmentClass: 'barbell', loadBearing: true })
    expect(resolveIncrement(['smith'])).toMatchObject({ increment: 2.5, equipmentClass: 'barbell' })
    expect(resolveIncrement(['barra_trap'])).toMatchObject({ equipmentClass: 'barbell' })
  })

  it('halteres usam passo de 2 kg', () => {
    expect(resolveIncrement(['halteres'])).toEqual({ increment: 2, equipmentClass: 'dumbbell', loadBearing: true })
  })

  it('máquina e cabo usam passo de 5 kg (stack de pino)', () => {
    expect(resolveIncrement(['maquina'])).toMatchObject({ increment: 5, equipmentClass: 'machine' })
    expect(resolveIncrement(['cabo'])).toMatchObject({ increment: 5, equipmentClass: 'cable' })
  })

  it('ignora acessórios (banco) e usa o equipamento que carrega a carga', () => {
    expect(resolveIncrement(['halteres', 'banco'])).toMatchObject({ equipmentClass: 'dumbbell', increment: 2 })
    expect(resolveIncrement(['barra', 'banco'])).toMatchObject({ equipmentClass: 'barbell' })
    // só banco → nenhum equipamento de carga → default
    expect(resolveIncrement(['banco'])).toMatchObject({ equipmentClass: 'default' })
  })

  it('prioriza a classe que melhor define o passo quando há vários', () => {
    // barra + peso corporal (ex.: barra fixa com carga) → barra manda
    expect(resolveIncrement(['peso_corporal', 'barra'])).toMatchObject({ equipmentClass: 'barbell' })
    expect(resolveIncrement(['elastico', 'halteres'])).toMatchObject({ equipmentClass: 'dumbbell' })
  })

  it('peso corporal e elástico não são load-bearing (progressão por reps/resistência)', () => {
    expect(resolveIncrement(['peso_corporal'])).toMatchObject({ equipmentClass: 'bodyweight', loadBearing: false })
    expect(resolveIncrement(['barra_fixa'])).toMatchObject({ loadBearing: false })
    expect(resolveIncrement(['elastico'])).toMatchObject({ equipmentClass: 'band', loadBearing: false })
  })

  it('entrada vazia/inválida cai em default sem lançar', () => {
    expect(resolveIncrement(null)).toMatchObject({ equipmentClass: 'default', increment: 2.5, loadBearing: true })
    expect(resolveIncrement(undefined)).toMatchObject({ equipmentClass: 'default' })
    expect(resolveIncrement([])).toMatchObject({ equipmentClass: 'default' })
    expect(resolveIncrement(['inexistente_xyz'])).toMatchObject({ equipmentClass: 'default' })
  })

  it('normaliza case, espaços e hífens do slug', () => {
    expect(resolveIncrement(['  Barra  '])).toMatchObject({ equipmentClass: 'barbell' })
    expect(resolveIncrement(['Peso-Corporal'])).toMatchObject({ equipmentClass: 'bodyweight' })
    expect(resolveIncrement(['BARRA_TRAP'])).toMatchObject({ equipmentClass: 'barbell' })
  })
})

describe('roundToIncrement', () => {
  it('arredonda PARA BAIXO por padrão (viés de segurança)', () => {
    expect(roundToIncrement(42.3, 5)).toBe(40)
    expect(roundToIncrement(43.7, 2.5)).toBe(42.5)
    expect(roundToIncrement(21, 2)).toBe(20)
  })

  it('respeita direção nearest e up', () => {
    expect(roundToIncrement(42.3, 5, 'nearest')).toBe(40)
    expect(roundToIncrement(43.0, 5, 'nearest')).toBe(45)
    expect(roundToIncrement(42.3, 5, 'up')).toBe(45)
  })

  it('evita ruído de ponto flutuante', () => {
    expect(roundToIncrement(0.3, 0.25)).toBe(0.25)
    expect(roundToIncrement(7.5, 2.5)).toBe(7.5)
  })

  it('incremento <= 0 devolve o valor original (ex.: elástico)', () => {
    expect(roundToIncrement(30, 0)).toBe(30)
    expect(roundToIncrement(30, -1)).toBe(30)
  })

  it('valores não finitos viram 0', () => {
    expect(roundToIncrement(NaN, 5)).toBe(0)
    expect(roundToIncrement(Infinity, 5)).toBe(0)
  })
})

describe('roundSuggestedWeight', () => {
  it('arredonda pelo equipamento do exercício', () => {
    expect(roundSuggestedWeight(42.3, ['maquina'])).toBe(40)
    expect(roundSuggestedWeight(43.7, ['barra'])).toBe(42.5)
    expect(roundSuggestedWeight(21.4, ['halteres'])).toBe(20)
  })

  it('não arredonda equipamento sem carga (elástico/peso corporal)', () => {
    expect(roundSuggestedWeight(12.7, ['elastico'])).toBe(12.7)
    expect(roundSuggestedWeight(0, ['peso_corporal'])).toBe(0)
  })
})
