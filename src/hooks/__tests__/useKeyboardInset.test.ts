import { describe, it, expect } from 'vitest'
import { computeKeyboardInset, isKeyboardOpenInset } from '@/hooks/useKeyboardInset'

describe('computeKeyboardInset', () => {
  it('teclado aberto: inset = layout viewport − viewport visível', () => {
    // iPhone: innerHeight 844, visualViewport 508 com o teclado numérico aberto
    expect(computeKeyboardInset(844, 508)).toBe(336)
  })

  it('teclado fechado → 0', () => {
    expect(computeKeyboardInset(844, 844)).toBe(0)
  })

  it('ruído de arredondamento (<1px) não conta como teclado', () => {
    expect(computeKeyboardInset(844, 843.4)).toBe(0)
  })

  it('nunca negativo (visual viewport maior que o layout)', () => {
    expect(computeKeyboardInset(844, 900)).toBe(0)
  })

  it('entrada inválida → 0', () => {
    expect(computeKeyboardInset(undefined, undefined)).toBe(0)
  })
})

describe('isKeyboardOpenInset', () => {
  it('inset grande (teclado) → aberto', () => {
    expect(isKeyboardOpenInset(336)).toBe(true)
  })

  it('inset pequeno (barra do browser/URL) NÃO conta como teclado', () => {
    expect(isKeyboardOpenInset(60)).toBe(false)
    expect(isKeyboardOpenInset(120)).toBe(false) // exatamente no limiar
  })

  it('zero → fechado', () => {
    expect(isKeyboardOpenInset(0)).toBe(false)
  })
})
