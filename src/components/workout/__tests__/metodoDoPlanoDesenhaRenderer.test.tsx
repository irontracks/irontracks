import { render, screen, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'

/**
 * O método SALVO NO PLANO precisa chegar ao desenho da série (01/09/2026).
 *
 * "Salvar no plano" grava `sets.per_set_method` e o dado volta no `setDetails`.
 * O roteador dos 14 renderers (`ExerciseCard.renderSet`) lia SÓ o log da
 * sessão — nesse estado a escrita ia certa para o banco e a série continuava
 * desenhando Normal na semana seguinte: gravação correta, botão inútil.
 *
 * Guard de FORMA não pega isso (a chamada continua parecendo certa), e o teste
 * do módulo puro também não: cada ponta passa sozinha. O que prova é o CARD
 * montado escolhendo o renderer.
 */

vi.mock('@/components/ui/HelpHint', () => ({ HelpHint: () => null }))
vi.mock('@/components/ExecutionVideoCapture', () => ({ default: () => null }))
vi.mock('../AIExerciseSwap', () => ({ default: () => null }))
vi.mock('../PlateCalculatorSheet', () => ({ default: () => null }))
vi.mock('../set-renderers', () => {
  const stub = (nome: string) => () => <div>{`renderer:${nome}`}</div>
  return {
    NormalSet: stub('normal'), RestPauseSet: stub('rest-pause'), ClusterSet: stub('cluster'),
    DropSetSet: stub('drop'), StrippingSet: stub('stripping'), FST7Set: stub('fst7'),
    HeavyDutySet: stub('heavy'), PontoZeroSet: stub('ponto-zero'), ForcedRepsSet: stub('forcadas'),
    NegativeRepsSet: stub('negativas'), PartialRepsSet: stub('parciais'),
    Sistema21Set: stub('s21'), WaveSet: stub('onda'), GroupMethodSet: stub('grupo'),
  }
})
vi.mock('../set-renderers/SetMethodPicker', () => ({ SetMethodPicker: () => null }))

const exercises = [{ id: 'a', name: 'Supino reto', sets: 1 }]

let logByKey: Record<string, Record<string, unknown>> = {}
let plannedSet: Record<string, unknown> | null = null

const ctx = {
  get exercises() { return exercises },
  deferredExercises: new Set<number>(),
  deferExercise: vi.fn(),
  resumeExercise: vi.fn(),
  workout: { id: 'w1' },
  collapsed: new Set<number>(),
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
  get getPlannedSet() { return () => plannedSet },
  getPlanConfig: () => null,
  getLog: (k: string) => logByKey[k] ?? {},
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
  useWorkoutLogs: () => logByKey,
}))

import ExerciseCard from '../ExerciseCard'

beforeEach(() => {
  logByKey = {}
  plannedSet = null
})
afterEach(() => cleanup())

describe('método salvo no plano chega ao renderer', () => {
  it('sem método salvo, a série é a normal de sempre', () => {
    render(<ExerciseCard ex={exercises[0]} exIdx={0} />)
    expect(screen.getByText('renderer:normal')).toBeTruthy()
  })

  it('Drop-Set salvo no PLANO desenha o drop, sem nada no log da sessão', () => {
    plannedSet = { set_number: 1, per_set_method: 'Drop-Set' }
    render(<ExerciseCard ex={exercises[0]} exIdx={0} />)
    expect(screen.getByText('renderer:drop')).toBeTruthy()
  })

  it('a escolha de HOJE vence a do plano — trocar para Normal vale na hora', () => {
    plannedSet = { set_number: 1, per_set_method: 'Drop-Set' }
    logByKey['0-0'] = { per_set_method: 'Normal' }
    render(<ExerciseCard ex={exercises[0]} exIdx={0} />)
    expect(screen.getByText('renderer:normal')).toBeTruthy()
  })
})
