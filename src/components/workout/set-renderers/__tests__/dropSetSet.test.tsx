import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DropSetSet } from '../dropSetSet'

// HelpHint usa useDialog (precisa de DialogProvider) — irrelevante pro teste.
vi.mock('@/components/ui/HelpHint', () => ({ HelpHint: () => null }))

// Mock do WorkoutContext (mesmo hook dos outros set-renderers)
let plannedSet: Record<string, unknown> | null = null
let logValue: Record<string, unknown> = {}
vi.mock('../../WorkoutContext', () => ({
  useWorkoutContext: () => ({
    getLog: () => logValue,
    updateLog: vi.fn(),
    getPlannedSet: () => plannedSet,
    setDropSetModal: vi.fn(),
    dropSetDraftsRef: { current: {} },
    openNotesKeys: new Set<string>(),
    toggleNotes: vi.fn(),
    reportHistory: null,
  }),
}))

const renderDrop = (ex: Record<string, unknown>) =>
  render(<DropSetSet ex={ex as never} exIdx={0} setIdx={0} />)

beforeEach(() => {
  plannedSet = null
  logValue = {}
})

describe('DropSetSet — drop-set pelo método do exercício (sem advanced_config)', () => {
  it('método "Drop-set" sem config → renderiza (defaulta 2 etapas), não fica em branco', () => {
    plannedSet = null
    renderDrop({ name: 'Rosca direta', method: 'Drop-set' })
    // A linha expandida do drop-set tem o botão "Abrir" (configura as etapas).
    expect(screen.getByText('Abrir')).toBeInTheDocument()
  })

  it('aceita variação de case/hífen ("Drop-Set", "dropset")', () => {
    plannedSet = null
    const { rerender } = renderDrop({ name: 'X', method: 'Drop-Set' })
    expect(screen.getByText('Abrir')).toBeInTheDocument()
    rerender(<DropSetSet ex={{ name: 'X', method: 'dropset' } as never} exIdx={0} setIdx={0} />)
    expect(screen.getByText('Abrir')).toBeInTheDocument()
  })

  it('método NÃO drop-set e sem estágios → null (não renderiza nada)', () => {
    plannedSet = null
    const { container } = renderDrop({ name: 'X', method: 'Normal' })
    expect(container).toBeEmptyDOMElement()
  })

  it('com advanced_config (array) → renderiza normalmente mesmo sem método', () => {
    plannedSet = { advanced_config: [{ weight: '30', reps: 10 }, { weight: '20', reps: 8 }] }
    renderDrop({ name: 'X' })
    expect(screen.getByText('Abrir')).toBeInTheDocument()
  })
})

describe('DropSetSet — override por série (per_set_method)', () => {
  it('série virada em Drop-Set pelo seletor NÃO some da tela', () => {
    // Bug relatado pelo dono (19/08/2026): "criei uma série nova e, ao clicar em
    // Drop, a série é excluída". Nada era apagado — o exercício continua com
    // method 'Normal', então `stagesCount` dava 0 e a linha renderizava null.
    plannedSet = null
    logValue = { per_set_method: 'Drop-Set' }
    renderDrop({ name: 'Rosca direta', method: 'Normal' })
    expect(screen.getByText('Abrir')).toBeInTheDocument()
  })

  it('sem override e sem método drop, segue devolvendo null', () => {
    plannedSet = null
    logValue = { per_set_method: '' }
    const { container } = renderDrop({ name: 'X', method: 'Normal' })
    expect(container).toBeEmptyDOMElement()
  })
})

describe('drop no molde da série normal', () => {
  // jsdom não faz layout: o que se prova aqui é ONDE cada coisa é renderizada.
  // Histórico: com o chip de falha ganhando rótulo, o "DROP" transbordava e era
  // desenhado POR CIMA do "FALHA" no aparelho (19/08/2026); cortá-lo com
  // overflow-hidden apagava o nome do método. A saída foi padronizar o card pelo
  // da série normal — controles em cima, informação e falha no rodapé.
  const montar = () => {
    plannedSet = { advanced_config: [{ weight: '50', reps: 10 }, { weight: '40', reps: 8 }] }
    return renderDrop({ name: 'Pullover no cabo' })
  }
  const grade = (c: HTMLElement) => c.querySelector('.grid')
  const rodape = (c: HTMLElement) => c.querySelector('.grid')?.parentElement?.querySelector('.mt-1')

  it('a linha de controles tem as MESMAS colunas da série normal, com o Abrir no lugar dos campos', () => {
    const { container } = montar()
    const g = grade(container) as HTMLElement
    // 32px (nº) · 36px (notas) · 1fr (Abrir, ocupando a faixa dos campos) · 92px (Concluir)
    expect(g.style.gridTemplateColumns).toBe('32px 36px minmax(0,1fr) 92px')
    expect(g.textContent).toMatch(/Abrir/)
  })

  it('a linha de controles não hospeda rótulo, etapas nem falha', () => {
    const { container } = montar()
    const g = grade(container) as HTMLElement
    expect(g.textContent).not.toMatch(/etapas/)
    expect(g.textContent).not.toMatch(/falha/i)
  })

  it('rótulo, etapas e chip de falha ficam no rodapé do card', () => {
    const { container } = montar()
    const r = rodape(container) as HTMLElement
    expect(r.textContent).toMatch(/Drop/i)
    expect(r.textContent).toMatch(/2 etapas/)
    expect(r.textContent).toMatch(/falha/i)
  })
})
