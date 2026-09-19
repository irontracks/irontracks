import { describe, it, expect, vi } from 'vitest'
import { criarCoordenadorDeVozUnica } from '../vozAtivaSingleton'

describe('coordenadorDeVozUnica — só um ditado por vez', () => {
  it('iniciar uma segunda gravação PARA a primeira', () => {
    const c = criarCoordenadorDeVozUnica()
    const pararA = vi.fn()
    const pararB = vi.fn()

    c.iniciar(pararA)
    expect(pararA).not.toHaveBeenCalled()

    c.iniciar(pararB)
    expect(pararA).toHaveBeenCalledTimes(1)
    expect(pararB).not.toHaveBeenCalled()
  })

  it('finalizar libera a trava — a próxima iniciar não chama nada de anterior', () => {
    const c = criarCoordenadorDeVozUnica()
    const pararA = vi.fn()
    c.iniciar(pararA)
    c.finalizar()

    const pararB = vi.fn()
    c.iniciar(pararB)
    expect(pararA).not.toHaveBeenCalled()
  })

  it('iniciar de novo com a MESMA função de parar não a chama contra si mesma', () => {
    const c = criarCoordenadorDeVozUnica()
    const parar = vi.fn()
    c.iniciar(parar)
    c.iniciar(parar)
    expect(parar).not.toHaveBeenCalled()
  })

  it('a função de parar que lança não impede o registro da nova', () => {
    const c = criarCoordenadorDeVozUnica()
    const pararQueLanca = vi.fn(() => { throw new Error('já tinha parado') })
    c.iniciar(pararQueLanca)
    expect(() => c.iniciar(vi.fn())).not.toThrow()
  })
})
