/**
 * Prova que os atributos CHEGAM ao HTML.
 *
 * As props certas no objeto não bastam: `autoCorrect` e `autoCapitalize` são
 * atributos de WebKit e o React precisa emiti-los tal e qual para o teclado do
 * iOS obedecer. Um typo no nome da prop (`autocorrect`, `autoCorrection`)
 * passaria despercebido no TypeScript — o React aceita atributos arbitrários em
 * elementos do DOM — e o guard de fonte continuaria verde, porque o texto do
 * arquivo estaria "certo".
 */
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { properNameFieldProps, codeFieldProps, plainFieldProps } from '../textFieldProps'

describe('os atributos de teclado chegam ao HTML', () => {
  it('nome próprio: corretor desligado, cada palavra capitalizada', () => {
    const { getByRole } = render(<input {...properNameFieldProps} aria-label="n" readOnly />)
    const el = getByRole('textbox')
    expect(el.getAttribute('autocorrect')).toBe('off')
    expect(el.getAttribute('autocapitalize')).toBe('words')
    expect(el.getAttribute('spellcheck')).toBe('false')
  })

  it('código: maiúsculas', () => {
    const { getByRole } = render(<input {...codeFieldProps} aria-label="c" readOnly />)
    expect(getByRole('textbox').getAttribute('autocapitalize')).toBe('characters')
    expect(getByRole('textbox').getAttribute('autocorrect')).toBe('off')
  })

  it('identificador sem forma de palavra: nada de capitalizar', () => {
    const { getByRole } = render(<input {...plainFieldProps} aria-label="p" readOnly />)
    expect(getByRole('textbox').getAttribute('autocapitalize')).toBe('none')
    expect(getByRole('textbox').getAttribute('autocorrect')).toBe('off')
  })

  it('um prop explícito no campo ainda vence o spread', () => {
    // O spread vai ANTES justamente para permitir exceção pontual.
    const { getByRole } = render(
      <input {...properNameFieldProps} autoCapitalize="none" aria-label="x" readOnly />,
    )
    expect(getByRole('textbox').getAttribute('autocapitalize')).toBe('none')
  })
})
