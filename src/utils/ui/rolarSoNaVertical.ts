/**
 * Rola SÓ NA VERTICAL o mínimo para `el` ficar visível dentro do contêiner que
 * rola, com uma margem inferior (o rodapé fixo do treino).
 *
 * Por que não `el.scrollIntoView({ block: 'nearest' })`: ele também rola na
 * HORIZONTAL (`inline: 'nearest'` é o default), e faz isso mesmo em contêiner
 * `overflow-x: hidden` — que é o caso da lista do treino ativo. Medido em
 * produção (06/09/2026, #1085): a fileira de chips do seletor de método era
 * mais larga que a tela, o scrollIntoView deslocou a lista inteira ~50pt
 * para a esquerda, e como o overflow é hidden o usuário não tinha como
 * arrastar de volta. A tela ficava cortada até sair do treino.
 *
 * Aqui só `scrollTop` muda. Nunca `scrollLeft` — há guard.
 */
export const MARGEM_INFERIOR_PX = 128

function contêinerQueRola(el: HTMLElement): HTMLElement | null {
  let p: HTMLElement | null = el.parentElement
  while (p) {
    let oy = ''
    try { oy = getComputedStyle(p).overflowY } catch { oy = '' }
    if (oy === 'auto' || oy === 'scroll') return p
    p = p.parentElement
  }
  return null
}

export function rolarSoNaVertical(el: HTMLElement, margemInferiorPx: number = MARGEM_INFERIOR_PX): number {
  const cont = contêinerQueRola(el)
  if (!cont) return 0
  const r = el.getBoundingClientRect()
  const c = cont.getBoundingClientRect()
  const sobraEmbaixo = r.bottom + margemInferiorPx - c.bottom
  const sobraEmCima = c.top - r.top
  let delta = 0
  if (sobraEmbaixo > 0) delta = sobraEmbaixo
  else if (sobraEmCima > 0) delta = -sobraEmCima
  if (delta !== 0) cont.scrollTop += delta
  return delta
}
