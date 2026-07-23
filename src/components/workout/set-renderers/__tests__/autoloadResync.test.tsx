import { render } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NormalSet } from '../normalSet'

/**
 * Guard: o peso preenchido pelo autoload NUNCA pode divergir da sugestão exibida.
 *
 * INCIDENTE QUE ORIGINOU ESTE TESTE
 * Print do dono (Leg press): a caixa mostrava **90** em violeta enquanto a
 * explicação ao lado dizia "subi p/ **95**kg". O preenchimento era one-shot
 * (trava `weightSource`), mas a sugestão muda depois — o histórico carrega do
 * cache primeiro e é atualizado pela rede. O texto acompanhava; o número não.
 * Consequência real: concluir a série gravaria 90 achando que era o que o motor
 * mandou.
 *
 * INVARIANTE: enquanto o valor ainda for do motor (`weightSource === 'auto'`),
 * ele re-sincroniza quando a sugestão muda. Se o usuário digitou (`'user'`),
 * nunca é reescrito.
 */
const updateLog = vi.fn()
let logStore: Record<string, unknown> = {}
let suggestions: Record<string, unknown> = {}

const ctx = {
  getLog: () => logStore,
  updateLog,
  updateSetType: vi.fn(),
  getPlanConfig: () => null,
  getPlannedSet: () => null,
  startTimer: vi.fn(),
  openNotesKeys: new Set<string>(),
  toggleNotes: vi.fn(),
  deloadSuggestions: {},
  autoLoadEnabled: true,
  get autoLoadSuggestions() { return suggestions },
  setCollapsed: vi.fn(),
  reportHistory: null,
  settings: {},
}

vi.mock('@/components/ui/HelpHint', () => ({ HelpHint: () => null }))
vi.mock('../../WorkoutContext', () => ({ useWorkoutContext: () => ctx }))

const EX = { name: 'Leg press 45°', sets: 3, reps: '15-20' }
const renderSet = () =>
  render(<NormalSet ex={EX as never} exIdx={0} setIdx={0} setsCount={3} />)

/** Pesos passados ao updateLog nesta renderização. */
const weightsWritten = () =>
  updateLog.mock.calls.map((c) => (c[1] as Record<string, unknown>)?.weight).filter(Boolean)

beforeEach(() => {
  updateLog.mockClear()
  logStore = {}
  suggestions = {}
})

describe('Autoload — valor preenchido acompanha a sugestão', () => {
  it('preenche a caixa vazia com a sugestão', () => {
    suggestions = { '0-0': { weight: 90, reps: 20, confidence: 'high', rationale: 'x' } }
    renderSet()
    expect(weightsWritten()).toContain('90')
  })

  it('RE-SINCRONIZA quando a sugestão muda e o valor ainda é do motor', () => {
    // Estado após o 1º preenchimento (cache): 90, fonte 'auto'.
    logStore = { weight: '90', weightSource: 'auto' }
    // A rede atualizou o histórico e a sugestão virou 95.
    suggestions = { '0-0': { weight: 95, reps: 20, confidence: 'high', rationale: 'subi p/ 95kg' } }
    renderSet()
    expect(
      weightsWritten(),
      'o número congelou em 90 enquanto a explicação já dizia 95 — foi o bug do print',
    ).toContain('95')
  })

  it('NÃO reescreve o peso que o usuário digitou', () => {
    logStore = { weight: '80', weightSource: 'user' }
    suggestions = { '0-0': { weight: 95, reps: 20, confidence: 'high', rationale: 'x' } }
    renderSet()
    expect(weightsWritten()).not.toContain('95')
  })

  it('NÃO sobrescreve valor preexistente de origem desconhecida (sessão restaurada)', () => {
    logStore = { weight: '70' } // sem weightSource → não é nosso
    suggestions = { '0-0': { weight: 95, reps: 20, confidence: 'high', rationale: 'x' } }
    renderSet()
    expect(weightsWritten()).not.toContain('95')
  })
})
