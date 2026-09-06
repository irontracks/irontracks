import { render, screen, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Card RECOLHIDO = uma linha (auditoria da tela do treino ativo, 06/09/2026).
 *
 * Medido no aparelho: recolher pelo chevron escondia só as SÉRIES. Ficavam a
 * descrição técnica (2 linhas + "Ver técnica") e a barra de 5–7 ações —
 * **206pt para um card fechado**. Com dez exercícios abertos por padrão, a
 * lista inteira virava rolagem; recolher não resolvia porque quase nada
 * recolhia.
 *
 * Recolhido agora mostra título + meta + "faltam N" e nada mais. O que fica
 * FORA de propósito: as faixas de adiado/dispensado (o "Retomar" não pode
 * exigir expandir — ver pularFazerDepois.test.tsx).
 */

vi.mock('@/components/ui/HelpHint', () => ({ HelpHint: () => null }))
vi.mock('@/components/ExecutionVideoCapture', () => ({ default: () => null }))
vi.mock('../AIExerciseSwap', () => ({ default: () => null }))
vi.mock('../PlateCalculatorSheet', () => ({ default: () => null }))
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

const exercises = [
  { id: 'a', name: 'Supino reto', sets: 3, notes: 'Retração escapular antes de empurrar. Cotovelos a 45 graus.' },
]

let logByKey: Record<string, Record<string, unknown>> = {}
let collapsed = new Set<number>()

const ctx = {
  get exercises() { return exercises },
  deferredExercises: new Set<number>(),
  deferExercise: vi.fn(),
  resumeExercise: vi.fn(),
  workout: { id: 'w1' },
  get collapsed() { return collapsed },
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
  getPlannedSet: () => null,
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
  collapsed = new Set<number>()
})
afterEach(() => cleanup())

describe('ExerciseCard recolhido', () => {
  it('expandido mostra técnica e a barra de ações (senão o caso seguinte não prova nada)', () => {
    render(<ExerciseCard ex={exercises[0]} exIdx={0} />)
    expect(screen.getByText(/Retração escapular/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Editar exercício/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Remover exercício/i })).toBeTruthy()
  })

  it('recolhido esconde a técnica E a barra de ações', () => {
    collapsed = new Set([0])
    render(<ExerciseCard ex={exercises[0]} exIdx={0} />)
    expect(screen.queryByText(/Retração escapular/i)).toBeNull()
    expect(screen.queryByRole('button', { name: /Editar exercício/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /Remover exercício/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /Sincronizar pesos/i })).toBeNull()
  })

  it('recolhido diz o que FALTA — o número acionável, não o feito', () => {
    logByKey = { '0-0': { done: true } }
    collapsed = new Set([0])
    render(<ExerciseCard ex={exercises[0]} exIdx={0} />)
    expect(screen.getByText(/faltam 2/i)).toBeTruthy()
  })

  it('recolhido e completo diz "feito"', () => {
    logByKey = { '0-0': { done: true }, '0-1': { done: true }, '0-2': { done: true } }
    collapsed = new Set([0])
    render(<ExerciseCard ex={exercises[0]} exIdx={0} />)
    expect(screen.getByText(/^feito$/i)).toBeTruthy()
  })

  it('o título continua sendo o gatilho de expandir', () => {
    collapsed = new Set([0])
    render(<ExerciseCard ex={exercises[0]} exIdx={0} />)
    expect(screen.getByRole('button', { name: /Expandir Supino reto/i })).toBeTruthy()
  })
})

/**
 * Os dois cards de configuração no topo do treino (carga automática e
 * descarga) viraram UMA linha cada — eram ~134pt de ajuste antes do primeiro
 * exercício, em todo treino, e o primeiro "Concluir" ficava a 66% da tela do
 * maior iPhone. A frase explicativa foi para o `title`, não sumiu.
 */
describe('cards de configuração do topo são de uma linha', () => {
  const semComentarios = (s: string) =>
    s.replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '')

  it('carga automática: sem subtítulo como texto, explicação no title', () => {
    const src = semComentarios(readFileSync(join(process.cwd(), 'src/components/ActiveWorkout.tsx'), 'utf8'))
    const bloco = src.slice(src.indexOf('aria-label="Carga automática"'), src.indexOf('Teacher control badge'))
    expect(bloco.length).toBeGreaterThan(200)
    expect(bloco).toMatch(/title=\{[^}]*O motor sugere seus pesos/)
    // O subtítulo como <span> de texto era a segunda linha do card.
    expect(bloco).not.toMatch(/<span[^>]*>\s*\{props\.settings\?\.autoLoad \? 'O motor sugere/)
    expect(bloco).toMatch(/py-1\.5/)
  })

  it('descarga do treino (modo ligado): frase no title, uma linha', () => {
    const src = semComentarios(readFileSync(join(process.cwd(), 'src/components/workout/SessionDeloadBanner.tsx'), 'utf8'))
    const bloco = src.slice(src.indexOf('if (autoLoadEnabled) {'), src.indexOf('if (!sessionDeloadAlert || dispensado) return null'))
    expect(bloco.length).toBeGreaterThan(200)
    expect(bloco).toMatch(/title=\{workoutDeloadEnabled/)
    expect(bloco).not.toMatch(/<div[^>]*>\s*\{workoutDeloadEnabled\s*\?\s*'Em dia ruim/)
  })
})
