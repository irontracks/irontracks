import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { DropSetSet } from '../dropSetSet'

// HelpHint usa useDialog (precisa de DialogProvider) — irrelevante pro teste.
vi.mock('@/components/ui/HelpHint', () => ({ HelpHint: () => null }))

// Mock do WorkoutContext (mesmo hook dos outros set-renderers)
let plannedSet: Record<string, unknown> | null = null
vi.mock('../../WorkoutContext', () => ({
  useWorkoutContext: () => ({
    getLog: () => ({}),
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
