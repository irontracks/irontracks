import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useState } from 'react'
import { NumericInput } from '../NumericInput'

/**
 * Regressão (reportado pelo dono, IMG_0059): campos de peso/carga/valor não deixavam
 * digitar vírgula (95,5) porque usavam <input type="number">, que num WebView com locale
 * != pt-BR rejeita a vírgula. E guardar como Number fazia a vírgula "não grudar".
 */
describe('NumericInput', () => {
  it('não renderiza type="number" (é o que bloqueia a vírgula no WebView)', () => {
    render(<NumericInput aria-label="peso" value={null} onValueChange={() => {}} />)
    const el = screen.getByLabelText('peso') as HTMLInputElement
    expect(el.getAttribute('type')).toBe('text')
    expect(el.getAttribute('inputmode')).toBe('decimal')
  })

  it('decimal=false usa teclado numérico e descarta separador', () => {
    const onValueChange = vi.fn()
    render(<NumericInput aria-label="reps" value={null} decimal={false} onValueChange={onValueChange} />)
    const el = screen.getByLabelText('reps') as HTMLInputElement
    expect(el.getAttribute('inputmode')).toBe('numeric')
    fireEvent.change(el, { target: { value: '12,5' } })
    expect(el.value).toBe('125')
    expect(onValueChange).toHaveBeenLastCalledWith(125)
  })

  it('a vírgula GRUDA ao digitar e entrega o número normalizado ao pai', () => {
    const seen: (number | null)[] = []
    function Host() {
      const [v, setV] = useState<number | null>(null)
      return (
        <NumericInput
          aria-label="peso"
          value={v}
          onValueChange={(n) => { seen.push(n); setV(n) }}
        />
      )
    }
    render(<Host />)
    const el = screen.getByLabelText('peso') as HTMLInputElement
    // simula a digitação incremental de "95,5"
    fireEvent.change(el, { target: { value: '9' } })
    fireEvent.change(el, { target: { value: '95' } })
    fireEvent.change(el, { target: { value: '95,' } })
    expect(el.value).toBe('95,') // a vírgula NÃO some enquanto digita
    fireEvent.change(el, { target: { value: '95,5' } })
    expect(el.value).toBe('95,5')
    expect(seen[seen.length - 1]).toBe(95.5) // pai recebe 95.5, não NaN nem 95
  })

  it('campo vazio entrega null', () => {
    const onValueChange = vi.fn()
    render(<NumericInput aria-label="carga" value={50} onValueChange={onValueChange} />)
    const el = screen.getByLabelText('carga') as HTMLInputElement
    fireEvent.change(el, { target: { value: '' } })
    expect(onValueChange).toHaveBeenLastCalledWith(null)
  })

  it('sincroniza quando o valor do pai muda por fora (sem foco)', () => {
    const { rerender } = render(<NumericInput aria-label="p" value={80} onValueChange={() => {}} />)
    const el = screen.getByLabelText('p') as HTMLInputElement
    expect(el.value).toBe('80')
    rerender(<NumericInput aria-label="p" value={92.5} onValueChange={() => {}} />)
    expect(el.value).toBe('92.5')
  })
})
