import { describe, it, expect } from 'vitest'
import { extractJsonFromModelText } from '@/utils/ai/extractJson'

describe('extractJsonFromModelText — fonte única (antes eram 3 cópias idênticas)', () => {
  it('faz parse de JSON puro', () => {
    expect(extractJsonFromModelText('{"a":1}')).toEqual({ a: 1 })
  })

  it('recorta JSON embrulhado em prosa/markdown', () => {
    expect(extractJsonFromModelText('Claro! ```json\n{"x": 2}\n``` pronto')).toEqual({ x: 2 })
  })

  it('retorna null para texto sem objeto', () => {
    expect(extractJsonFromModelText('nenhum json aqui')).toBeNull()
    expect(extractJsonFromModelText('')).toBeNull()
    expect(extractJsonFromModelText('   ')).toBeNull()
  })

  it('pega do primeiro { ao último }', () => {
    expect(extractJsonFromModelText('lixo {"a": {"b": 1}} lixo')).toEqual({ a: { b: 1 } })
  })
})
