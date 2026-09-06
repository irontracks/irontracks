import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { SetMethodPicker } from '../SetMethodPicker'

/**
 * O seletor de método abre a fileira de chips ABAIXO do rótulo. Na última
 * série visível da tela, essa fileira nasce por baixo do FINALIZAR (o
 * `WorkoutFooter` é `fixed bottom`): o usuário tocava em "Normal", nada
 * aparecia, e concluía que o seletor não funciona. Achado da auditoria de
 * 05/09/2026 (os dois auditores).
 *
 * A correção é rolar o mínimo (`block: 'nearest'`) DEPOIS do paint e reservar
 * a margem do rodapé (`scroll-mb-*`). jsdom não implementa `scrollIntoView`
 * nem mede layout — o que este arquivo prova é a fiação: o efeito roda ao
 * abrir, com o modo certo, e a margem está no elemento que rola.
 */
const rafOriginal = globalThis.requestAnimationFrame
const scrollOriginal = Element.prototype.scrollIntoView

beforeEach(() => {
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => { cb(0); return 1 }) as typeof requestAnimationFrame
  Element.prototype.scrollIntoView = vi.fn()
})
afterEach(() => {
  globalThis.requestAnimationFrame = rafOriginal
  Element.prototype.scrollIntoView = scrollOriginal
})

describe('SetMethodPicker rola a fileira para dentro da tela ao abrir', () => {
  it('abrir chama scrollIntoView com block nearest, na fileira de chips', () => {
    render(<SetMethodPicker current="Normal" onSelect={() => {}} />)
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /Método da série/ }))
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1)
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' })
    const fileira = screen.getByRole('button', { name: 'Normal' }).parentElement as HTMLElement
    expect(fileira.className).toMatch(/\bscroll-mb-\d+\b/)
  })

  it('fechar não rola de novo', () => {
    render(<SetMethodPicker current="Normal" onSelect={() => {}} />)
    const toggle = screen.getByRole('button', { name: /Método da série/ })
    fireEvent.click(toggle)
    fireEvent.click(toggle)
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1)
  })
})
