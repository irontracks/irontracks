import { render, screen, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import React from 'react'

/**
 * O CARD coloca a conversa na barra de ações — e só na sessão do dono.
 *
 * O irmão deste arquivo (`conversaSoDoDonoDaSessao`) prova a decisão e o
 * componente do botão. Falta a ponta que nenhum dos dois alcança: o card
 * RENDERIZAR o botão, dentro do bloco que só existe com o exercício aberto.
 * Sem este caso, apagar a linha do `ExerciseCard` deixaria tudo verde — é a
 * armadilha nº 3 da lista do repo ("cobrindo as pontas e não a fiação").
 */

vi.mock('@/components/ui/HelpHint', () => ({ HelpHint: () => null }))
vi.mock('@/components/ExecutionVideoCapture', () => ({ default: () => null }))
vi.mock('../AIExerciseSwap', () => ({ default: () => null }))
vi.mock('../PlateCalculatorSheet', () => ({ default: () => null }))
vi.mock('@/utils/supabase/client', () => ({ createClient: () => ({ storage: { from: () => ({}) } }) }))
vi.mock('../set-renderers', () => {
  const stub = () => null
  return {
    NormalSet: stub, RestPauseSet: stub, ClusterSet: stub, DropSetSet: stub,
    StrippingSet: stub, FST7Set: stub, HeavyDutySet: stub, PontoZeroSet: stub,
    ForcedRepsSet: stub, NegativeRepsSet: stub, PartialRepsSet: stub,
    Sistema21Set: stub, WaveSet: stub, GroupMethodSet: stub,
  }
})
vi.mock('../set-renderers/SetMethodPicker', () => ({ SetMethodPicker: () => null }))

const exercises = [{ id: 'a', name: 'Supino reto', sets: 3 }]
const INICIO = Date.parse('2026-09-12T10:00:00.000Z')

/** Trocado entre os casos: é o único discriminador em jogo. */
let session: unknown = { startedAt: INICIO, workout: { exercises }, logs: {}, ui: {} }
let collapsed = new Set<number>()

const ctx = {
  get session() { return session },
  get exercises() { return exercises },
  get collapsed() { return collapsed },
  deferredExercises: new Set<number>(),
  deferExercise: vi.fn(),
  resumeExercise: vi.fn(),
  skippedExercises: new Set<number>(),
  skipExerciseToday: vi.fn(),
  unskipExercise: vi.fn(),
  workout: { id: 'w1' },
  toggleCollapse: vi.fn(),
  setCurrentExerciseIdx: vi.fn(),
  reportHistoryStatus: null,
  reportHistoryLoadingRef: { current: false },
  reportHistory: null,
  deloadAlerts: {},
  sessionDeloadAlert: null,
  openDeloadModal: vi.fn(),
  autoLoadEnabled: true,
  openEditExercise: vi.fn(),
  addExtraSetToExercise: vi.fn(),
  changeSetMethod: vi.fn(),
  getPlannedSet: () => null,
  getPlanConfig: () => null,
  getLog: () => ({}),
  alert: vi.fn(),
  removeSetAtIndex: vi.fn(),
  linkedWeightExercises: new Set<number>(),
  toggleLinkWeights: vi.fn(),
  deleteConfirmIdx: null,
  openDeleteConfirm: vi.fn(),
  closeDeleteConfirm: vi.fn(),
  removeExerciseFromWorkout: vi.fn(),
  settings: null,
  updateLog: vi.fn(),
  onSavePlateSetup: vi.fn(),
}
vi.mock('../WorkoutContext', () => ({
  useWorkoutContext: () => ctx,
  useWorkoutLogs: () => ({}),
}))

import ExerciseCard from '../ExerciseCard'

const BOTAO = /tirar dúvida sobre este exercício/i

afterEach(() => {
  cleanup()
  session = { startedAt: INICIO, workout: { exercises }, logs: {}, ui: {} }
  collapsed = new Set<number>()
})

describe('a barra de ações do card', () => {
  it('oferece a conversa quando a sessão é do dono', () => {
    render(<ExerciseCard ex={exercises[0]} exIdx={0} />)
    expect(screen.getByRole('button', { name: BOTAO })).toBeTruthy()
  })

  it('o vizinho de sempre continua lá — o botão novo não tomou o lugar de ninguém', () => {
    render(<ExerciseCard ex={exercises[0]} exIdx={0} />)
    expect(screen.getByRole('button', { name: /Editar exercício/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Remover exercício/i })).toBeTruthy()
  })

  it('some no Modo Spotter — o card é o mesmo, a sessão é de outra pessoa', () => {
    session = { workout: { exercises }, logs: {}, ui: {}, ehDeOutraPessoa: true }
    render(<ExerciseCard ex={exercises[0]} exIdx={0} />)
    expect(screen.queryByRole('button', { name: BOTAO })).toBeNull()
  })

  it('some com o card recolhido, junto com o resto da barra', () => {
    collapsed = new Set([0])
    render(<ExerciseCard ex={exercises[0]} exIdx={0} />)
    expect(screen.queryByRole('button', { name: BOTAO })).toBeNull()
  })
})
