/**
 * Guard do "campo numérico insere em vez de substituir" (achado no teste E2E de
 * 15/08/2026, com o app rodando): tocar num campo que já tem número posicionava
 * o cursor, então digitar INSERIA — com "2" no campo, digitar "1" produzia
 * "12". Na academia isso vira carga errada gravada no histórico, que é a mesma
 * base que alimenta o motor de carga automática.
 *
 * Invariantes:
 *  1. Campo numérico com conteúdo → todo o conteúdo fica SELECIONADO ao focar
 *     (é a seleção que faz a próxima tecla substituir).
 *  2. Campo VAZIO não tenta selecionar (nada a fazer) e campo de TEXTO livre
 *     nunca é tocado — apagaria o que o usuário escreveu na primeira tecla.
 *  3. A seleção acontece no frame SEGUINTE (o WebKit ainda está posicionando o
 *     cursor durante o onFocus) e é abortada se o foco já saiu do campo.
 *  4. A limpeza remove o listener — o shell monta/desmonta com o dashboard.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { installNumericSelectOnFocus, selectFieldContent } from '@/utils/ui/selectOnFocus'

// rAF síncrono: o helper adia a seleção de propósito (ver doc do módulo).
beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 1 })
})
afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

function campo(attrs: Record<string, string>, valor: string): HTMLInputElement {
  const el = document.createElement('input')
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
  el.value = valor
  document.body.appendChild(el)
  return el
}

describe('selectFieldContent', () => {
  it('seleciona todo o conteúdo de um campo com valor', () => {
    const el = campo({ type: 'text', inputmode: 'decimal' }, '42.5')
    el.focus()
    selectFieldContent(el)
    expect(el.selectionStart).toBe(0)
    expect(el.selectionEnd).toBe(4)
  })

  it('campo vazio: não mexe na seleção', () => {
    const el = campo({ type: 'text', inputmode: 'decimal' }, '')
    el.focus()
    el.setSelectionRange(0, 0)
    selectFieldContent(el)
    expect(el.selectionEnd).toBe(0)
  })

  it('foco já saiu do campo antes do frame seguinte: não rouba a seleção de volta', () => {
    const alvo = campo({ type: 'text', inputmode: 'decimal' }, '100')
    const outro = campo({ type: 'text' }, '')
    alvo.focus()
    // rAF que só roda depois de o foco mudar — simula o toque rápido em outro campo.
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { outro.focus(); cb(0); return 1 })
    alvo.setSelectionRange(3, 3)
    selectFieldContent(alvo)
    expect(alvo.selectionStart).toBe(3)
  })

  it('elemento nulo não quebra', () => {
    expect(() => selectFieldContent(null)).not.toThrow()
  })
})

describe('installNumericSelectOnFocus — listener delegado', () => {
  it('seleciona ao focar campo inputMode=decimal (peso/carga)', () => {
    const limpar = installNumericSelectOnFocus(document)
    const el = campo({ type: 'text', inputmode: 'decimal' }, '2')
    el.focus() // o focusin real chega DEPOIS de o campo receber o foco
    el.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    expect(el.selectionStart).toBe(0)
    expect(el.selectionEnd).toBe(1)
    limpar()
  })

  it('seleciona ao focar campo inputMode=numeric (sets/reps inteiros)', () => {
    const limpar = installNumericSelectOnFocus(document)
    const el = campo({ type: 'text', inputmode: 'numeric' }, '12')
    el.focus()
    el.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    expect(el.selectionEnd).toBe(2)
    limpar()
  })

  it('NÃO toca em campo de texto livre (nome do exercício, notas)', () => {
    const limpar = installNumericSelectOnFocus(document)
    const el = campo({ type: 'text' }, 'Supino reto')
    el.focus()
    el.setSelectionRange(11, 11)
    el.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    // Cursor no fim, como o usuário deixou — selecionar apagaria o texto na
    // primeira tecla.
    expect(el.selectionStart).toBe(11)
    limpar()
  })

  it('respeita o opt-out data-no-select-on-focus', () => {
    const limpar = installNumericSelectOnFocus(document)
    const el = campo({ type: 'text', inputmode: 'decimal', 'data-no-select-on-focus': '' }, '99')
    el.focus()
    el.setSelectionRange(2, 2)
    el.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    expect(el.selectionStart).toBe(2)
    limpar()
  })

  it('a limpeza remove o listener (sem vazar entre montagens do shell)', () => {
    const limpar = installNumericSelectOnFocus(document)
    limpar()
    const el = campo({ type: 'text', inputmode: 'decimal' }, '55')
    el.focus()
    el.setSelectionRange(2, 2)
    el.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    expect(el.selectionStart).toBe(2)
  })
})

/**
 * Guard de FIAÇÃO: o helper certo com ninguém chamando é o guard falso nº 3 do
 * CLAUDE.md ("cobrindo as pontas e não a fiação"). Estes casos travam que o
 * listener está montado no shell e que os dois caminhos explícitos
 * (NumericInput e useInputField) continuam ligados.
 */
describe('fiação — quem instala e quem usa', () => {
  const read = (p: string) => readFileSync(p, 'utf8')

  it('o shell do dashboard instala o listener delegado', () => {
    const src = read('src/app/(app)/dashboard/IronTracksAppClientImpl.tsx')
    expect(src).toMatch(/useEffect\(\(\)\s*=>\s*installNumericSelectOnFocus\(\),\s*\[\]\)/)
  })

  it('NumericInput seleciona ao focar', () => {
    expect(read('src/components/ui/NumericInput.tsx')).toMatch(/selectFieldContent\(e\.currentTarget\)/)
  })

  it('os campos de série (useInputField) selecionam por PADRÃO', () => {
    const src = read('src/components/workout/set-renderers/normalSet.tsx')
    // Default true: campo novo de peso/reps/RPE nasce certo.
    expect(src).toMatch(/selectOnFocus\s*=\s*opts\?\.selectOnFocus\s*!==\s*false/)
    expect(src).toMatch(/if \(selectOnFocus && el instanceof HTMLInputElement\) selectFieldContent\(el\)/)
  })

  it('notas é a exceção explícita (texto livre não pode ser apagado na 1ª tecla)', () => {
    const src = read('src/components/workout/set-renderers/normalSet.tsx')
    expect(src).toMatch(/notesField[\s\S]{0,300}selectOnFocus:\s*false/)
  })
})
