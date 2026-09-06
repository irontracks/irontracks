import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SetMethodPicker } from '../SetMethodPicker'
import { rolarSoNaVertical, MARGEM_INFERIOR_PX } from '@/utils/ui/rolarSoNaVertical'

/**
 * O seletor de método abre a fileira de chips abaixo do rótulo. Dois defeitos,
 * os dois vistos no iPhone em 06/09/2026:
 *
 *  1. A fileira NÃO QUEBRAVA LINHA: inline, o seletor é item de flex com
 *     largura de conteúdo, então os 12 chips saíam numa linha só, mais larga
 *     que a tela — Cluster/Stripping/Bi-Set ficavam cortados fora da vista.
 *     Hoje a fileira é `absolute left-0 right-0` até a LINHA da série
 *     (`relative` nos dois chamadores), e aí o `flex-wrap` tem largura para
 *     quebrar.
 *  2. A primeira correção (#1085) usava `scrollIntoView({ block: 'nearest' })`,
 *     que também rola na HORIZONTAL — e faz isso num contêiner
 *     `overflow-x: hidden`. A lista inteira deslocou ~50pt para a esquerda e
 *     o usuário não tinha como voltar. Hoje só `scrollTop` muda.
 *
 * jsdom não mede layout: o que este arquivo prova é a fiação e a regra.
 */
const rafOriginal = globalThis.requestAnimationFrame
beforeEach(() => {
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => { cb(0); return 1 }) as typeof requestAnimationFrame
})
afterEach(() => { globalThis.requestAnimationFrame = rafOriginal })

const SRC = join(process.cwd(), 'src/components/workout')
const semComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/** Monta um contêiner que rola (overflowY: auto) com rects controlados. */
function montarComScroller(rects: { cont: Partial<DOMRect>; el: Partial<DOMRect> }) {
  const scroller = document.createElement('div')
  scroller.style.overflowY = 'auto'
  document.body.appendChild(scroller)
  const utils = render(<SetMethodPicker current="Normal" onSelect={() => {}} />, { container: scroller })
  const rect = (p: Partial<DOMRect>) => ({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}), ...p }) as DOMRect
  scroller.getBoundingClientRect = () => rect(rects.cont)
  return { scroller, utils, rect }
}

describe('SetMethodPicker — a fileira aparece, e só a vertical se move', () => {
  it('a fileira de chips é absoluta e esticada até a linha da série', () => {
    render(<SetMethodPicker current="Normal" onSelect={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /Método da série/ }))
    const fileira = screen.getByRole('button', { name: 'Normal' }).parentElement as HTMLElement
    for (const cls of ['absolute', 'left-0', 'right-0', 'flex-wrap']) expect(fileira.className.split(/\s+/)).toContain(cls)
  })

  it('os DOIS chamadores dão `relative` à linha que hospeda o seletor', () => {
    const normal = semComentarios(readFileSync(join(SRC, 'set-renderers/normalSet.tsx'), 'utf8'))
    const card = semComentarios(readFileSync(join(SRC, 'ExerciseCard.tsx'), 'utf8'))
    // normalSet: a linha de rodapé (🧠 + método + falha)
    expect(normal).toMatch(/className="relative mt-1 flex items-center justify-between gap-2"/)
    // ExerciseCard: o wrapper do seletor dos renderers avançados
    expect(card).toMatch(/className="relative [^"]*flex justify-end"/)
  })

  it('abrir rola o contêiner só na vertical — scrollLeft não muda', () => {
    const { scroller, rect } = montarComScroller({ cont: { top: 0, bottom: 800 }, el: { top: 760, bottom: 790 } })
    // A fileira nasce no clique (render condicional), então o rect dela vai
    // no protótipo — mais larga que a tela de propósito (left -40, right 900):
    // é o caso que fazia o scrollIntoView deslocar na horizontal.
    const protoOriginal = Element.prototype.getBoundingClientRect
    Element.prototype.getBoundingClientRect = () => rect({ top: 760, bottom: 790, left: -40, right: 900, width: 940, height: 30 })
    try {
      scroller.scrollLeft = 0
      fireEvent.click(screen.getByRole('button', { name: /Método da série/ }))
      expect(scroller.scrollTop).toBe(790 + MARGEM_INFERIOR_PX - 800)
      expect(scroller.scrollLeft).toBe(0)
    } finally {
      Element.prototype.getBoundingClientRect = protoOriginal
    }
  })

  it('o componente não chama scrollIntoView (ele rola na horizontal também)', () => {
    const src = semComentarios(readFileSync(join(SRC, 'set-renderers/SetMethodPicker.tsx'), 'utf8'))
    expect(src).not.toMatch(/scrollIntoView/)
    expect(src).toMatch(/rolarSoNaVertical\(/)
  })
})

describe('rolarSoNaVertical — a regra', () => {
  const rect = (p: Partial<DOMRect>) => ({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}), ...p }) as DOMRect
  function cenario(cont: Partial<DOMRect>, el: Partial<DOMRect>) {
    const scroller = document.createElement('div')
    scroller.style.overflowY = 'auto'
    const meio = document.createElement('div')
    const alvo = document.createElement('div')
    meio.appendChild(alvo); scroller.appendChild(meio); document.body.appendChild(scroller)
    scroller.getBoundingClientRect = () => rect(cont)
    alvo.getBoundingClientRect = () => rect(el)
    return { scroller, alvo }
  }

  it('embaixo do rodapé: sobe o suficiente para caber com a margem', () => {
    const { scroller, alvo } = cenario({ top: 0, bottom: 800 }, { top: 700, bottom: 740, left: -100, right: 1200 })
    const delta = rolarSoNaVertical(alvo)
    expect(delta).toBe(740 + MARGEM_INFERIOR_PX - 800)
    expect(scroller.scrollTop).toBe(delta)
    expect(scroller.scrollLeft).toBe(0)
  })

  it('já visível com folga: não mexe', () => {
    const { scroller, alvo } = cenario({ top: 0, bottom: 800 }, { top: 100, bottom: 140 })
    expect(rolarSoNaVertical(alvo)).toBe(0)
    expect(scroller.scrollTop).toBe(0)
  })

  it('acima do topo: desce o mínimo', () => {
    const { scroller, alvo } = cenario({ top: 100, bottom: 800 }, { top: 60, bottom: 90 })
    scroller.scrollTop = 500
    expect(rolarSoNaVertical(alvo)).toBe(-40)
    expect(scroller.scrollTop).toBe(460)
  })

  it('sem contêiner que rola: não faz nada', () => {
    const alvo = document.createElement('div')
    document.body.appendChild(alvo)
    expect(rolarSoNaVertical(alvo)).toBe(0)
  })
})
