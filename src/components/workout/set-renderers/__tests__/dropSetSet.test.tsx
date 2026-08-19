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

describe('linha do drop — o rótulo do método não invade o chip de falha', () => {
  it('o contêiner do rótulo corta o que transborda', () => {
    // jsdom não faz layout: o que se prova aqui é a REGRA de CSS, não o pixel.
    // Com o chip de falha ganhando rótulo, o "DROP" (`shrink-0`) passou a
    // transbordar do contêiner `flex-1 min-w-0` e era desenhado POR CIMA do
    // "FALHA" — visto no iPhone 17 Pro Max em 19/08/2026.
    const SRC = readFileSync(join(process.cwd(), 'src/components/workout/set-renderers/dropSetSet.tsx'), 'utf8')
    expect(SRC).toMatch(/flex-1 min-w-0 overflow-hidden/)
  })
})
