import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DropSetSet } from '../dropSetSet'

/**
 * Guard: o drop-set semeia as etapas com a sugestão do motor.
 *
 * INCIDENTE: o autoload preenchia `log.weight`, mas as ETAPAS do drop leem
 * `saved`/`planned` — nunca `log.weight`. Resultado: o hint 🧠 aparecia, o peso
 * do drop continuava vazio e o usuário tinha que digitar tudo no modal.
 *
 * INVARIANTE: etapa VAZIA recebe a sugestão (1ª etapa = peso de trabalho, as
 * seguintes caem ~20%); etapa já preenchida (usuário ou template) é INTOCADA.
 * Verificado pelo que chega ao modal ao tocar em "Abrir" — que é o que o usuário vê.
 */
vi.mock('@/components/ui/HelpHint', () => ({ HelpHint: () => null }))

const setDropSetModal = vi.fn()
let logStore: Record<string, unknown> = {}
let plannedSet: Record<string, unknown> | null = null
let suggestions: Record<string, unknown> = {}

const ctx = {
  getLog: () => logStore,
  updateLog: vi.fn(),
  getPlanConfig: () => null,
  getPlannedSet: () => plannedSet,
  setDropSetModal,
  dropSetDraftsRef: { current: {} },
  openNotesKeys: new Set<string>(),
  toggleNotes: vi.fn(),
  reportHistory: null,
  autoLoadEnabled: true,
  get autoLoadSuggestions() { return suggestions },
}
vi.mock('../../WorkoutContext', () => ({ useWorkoutContext: () => ctx }))

/** Pesos das etapas entregues ao modal ao tocar em "Abrir". */
const stageWeightsSentToModal = (): string[] => {
  fireEvent.click(screen.getByText('Abrir'))
  const arg = setDropSetModal.mock.calls.at(-1)?.[0] as { stages?: Array<{ weight?: unknown }> }
  return (arg?.stages ?? []).map((s) => String(s?.weight ?? ''))
}

const renderDrop = () =>
  render(<DropSetSet ex={{ name: 'Mesa flexora', method: 'Drop-set' } as never} exIdx={0} setIdx={0} />)

beforeEach(() => {
  setDropSetModal.mockClear()
  logStore = {}
  plannedSet = null
  suggestions = {}
})

describe('Drop-set — autoload semeia as etapas', () => {
  it('etapas vazias recebem a sugestão, caindo ~20% por etapa', () => {
    // "Mesa flexora" → máquina (passo 5kg). 50 → 40 (50 × 0,8).
    suggestions = { '0-0': { weight: 50, reps: 10, confidence: 'high', rationale: 'x' } }
    renderDrop()
    expect(stageWeightsSentToModal()).toEqual(['50', '40'])
  })

  it('NÃO sobrescreve etapa já preenchida pelo template', () => {
    plannedSet = { advanced_config: [{ weight: '77', reps: 8 }, { weight: '55', reps: 8 }] }
    suggestions = { '0-0': { weight: 50, reps: 10, confidence: 'high', rationale: 'x' } }
    renderDrop()
    expect(stageWeightsSentToModal()).toEqual(['77', '55'])
  })

  it('sem sugestão, segue vazio (não inventa peso)', () => {
    suggestions = {}
    renderDrop()
    expect(stageWeightsSentToModal()).toEqual(['', ''])
  })
})
