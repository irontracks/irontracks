import { describe, it, expect, beforeEach } from 'vitest'
import { deloadFoiDispensadoHoje, dispensarDeloadHoje } from '../deloadDismissal'

/**
 * A dispensa do card de sugestão PRECISA sobreviver a remontar o componente —
 * é o bug que motivou este módulo (relato do dono, 19/09/2026: "essa parte
 * do deload aparecendo toda hora está me incomodando"). Antes vivia em
 * `useState(false)` dentro do `SessionDeloadBanner`, que reseta a cada
 * remontagem — sair da tela do treino e voltar já bastava para o card
 * reaparecer, mesmo já dispensado na mesma sessão.
 */
beforeEach(() => {
  try { window.localStorage.clear() } catch { /* jsdom sempre tem localStorage */ }
})

describe('deloadDismissal — sobrevive a remontar o componente', () => {
  it('sem dispensar, não está dispensado', () => {
    expect(deloadFoiDispensadoHoje('upper b')).toBe(false)
  })

  it('dispensar e reler (simulando remontagem) continua dispensado', () => {
    dispensarDeloadHoje('upper b')
    // Não há estado de componente aqui — cada chamada é uma leitura NOVA,
    // exatamente como a remontagem do banner faria.
    expect(deloadFoiDispensadoHoje('upper b')).toBe(true)
  })

  it('a dispensa é POR TREINO — dispensar um não esconde a sugestão de outro', () => {
    dispensarDeloadHoje('upper b')
    expect(deloadFoiDispensadoHoje('lower a')).toBe(false)
  })

  it('treino sem chave (string vazia) não quebra e não vaza para outro', () => {
    expect(() => dispensarDeloadHoje('')).not.toThrow()
    expect(deloadFoiDispensadoHoje('')).toBe(true)
    expect(deloadFoiDispensadoHoje('upper b')).toBe(false)
  })
})
