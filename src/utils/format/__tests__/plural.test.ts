import { describe, it, expect } from 'vitest'
import { plural, pluralize } from '@/utils/format/plural'

describe('plural', () => {
  it('singular só quando |n| === 1', () => {
    expect(plural(1, 'treino')).toBe('treino')
    expect(plural(0, 'treino')).toBe('treinos')
    expect(plural(2, 'treino')).toBe('treinos')
    expect(plural(-1, 'treino')).toBe('treino')
  })

  it('aceita forma plural irregular', () => {
    expect(plural(1, 'refeição', 'refeições')).toBe('refeição')
    expect(plural(3, 'refeição', 'refeições')).toBe('refeições')
  })
})

describe('pluralize', () => {
  it('junta número + palavra flexionada', () => {
    expect(pluralize(1, 'treino')).toBe('1 treino')
    expect(pluralize(0, 'treino')).toBe('0 treinos')
    expect(pluralize(2, 'treino')).toBe('2 treinos')
  })

  it('trunca e trata valores inválidos', () => {
    expect(pluralize(1.9, 'treino')).toBe('1 treino')
    expect(pluralize(NaN, 'treino')).toBe('0 treinos')
  })
})
