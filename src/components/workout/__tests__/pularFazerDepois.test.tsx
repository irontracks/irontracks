import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import fs from 'node:fs'
import path from 'node:path'

/**
 * "Pular — fazer depois" (28/08/2026, pedido do dono).
 *
 * O relato: fazer alguns exercícios fora da ordem num dia pontual. Editar o
 * treino seria errado — a ordem do TEMPLATE não mudou, só a execução de hoje.
 *
 * Estes casos cobrem o que a suíte não veria de outro jeito: a AÇÃO existir na
 * tela, o card guardado oferecer volta SEM precisar ser expandido, e a fiação
 * que liga o adiamento ao exercício atual — que é o que faz a tela bloqueada /
 * Ilha Dinâmica passarem a mostrar o próximo (a Live Activity lê
 * `currentExerciseIdx`, não a lista).
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
  { id: 'a', name: 'Supino reto', sets: 3 },
  { id: 'b', name: 'Rosca direta', sets: 3 },
]

let logByKey: Record<string, Record<string, unknown>> = {}
let deferred = new Set<number>()
let collapsed = new Set<number>()
const deferExercise = vi.fn((idx: number) => { deferred = new Set([...deferred, idx]) })
const resumeExercise = vi.fn((idx: number) => { deferred = new Set([...deferred].filter(i => i !== idx)) })

const ctx = {
  get exercises() { return exercises },
  get deferredExercises() { return deferred },
  deferExercise,
  resumeExercise,
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

const marcarFeitas = (exIdx: number, n: number) => {
  for (let i = 0; i < n; i++) logByKey[`${exIdx}-${i}`] = { done: true }
}

beforeEach(() => {
  logByKey = {}
  deferred = new Set<number>()
  collapsed = new Set<number>()
  deferExercise.mockClear()
  resumeExercise.mockClear()
})
afterEach(() => cleanup())

describe('ExerciseCard — pular e retomar', () => {
  it('oferece "Pular — fazer depois" num exercício ainda pendente', () => {
    render(<ExerciseCard ex={exercises[0]} exIdx={0} />)
    fireEvent.click(screen.getByText(/Pular — fazer depois/i))
    expect(deferExercise).toHaveBeenCalledWith(0)
  })

  it('NÃO oferece pular num exercício já concluído — não há o que adiar', () => {
    marcarFeitas(0, 3)
    render(<ExerciseCard ex={exercises[0]} exIdx={0} />)
    expect(screen.queryByText(/Pular — fazer depois/i)).toBeNull()
  })

  it('adiado mostra a volta, e ela NÃO exige expandir o card', () => {
    // Recolhido é como o adiamento deixa o card. Se o "Retomar" morasse dentro
    // do bloco expandido, voltar ao exercício custaria dois toques justamente
    // no momento em que o usuário veio fazê-lo.
    deferred = new Set([0])
    collapsed = new Set([0])
    render(<ExerciseCard ex={exercises[0]} exIdx={0} />)
    expect(screen.getByText(/Guardado para fazer depois/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Retomar/i }))
    expect(resumeExercise).toHaveBeenCalledWith(0)
  })

  it('adiado NÃO oferece pular de novo', () => {
    deferred = new Set([0])
    render(<ExerciseCard ex={exercises[0]} exIdx={0} />)
    expect(screen.queryByText(/Pular — fazer depois/i)).toBeNull()
  })
})

// ── Guards de FIAÇÃO e de CLASSE ────────────────────────────────────────────
// As duas coisas abaixo passam despercebidas por qualquer teste de render: elas
// não mudam o que aparece no card, mudam o que acontece DEPOIS do toque.

const read = (rel: string) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8')

/** Corpo de uma função a partir da chamada, por parênteses/chaves balanceados. */
function blocoDaFuncao(src: string, nome: string): string {
  const at = src.indexOf(`const ${nome} = useCallback(`)
  if (at === -1) return ''
  let depth = 0
  for (let i = src.indexOf('{', at); i < src.length; i++) {
    const c = src[i]
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return src.slice(at, i + 1)
    }
  }
  return ''
}

describe('adiar move o exercício ATUAL (é o que a tela bloqueada lê)', () => {
  const controller = read('src/components/workout/useActiveWorkoutController.ts')

  it('deferExercise entrega o foco ao próximo pendente', () => {
    const bloco = blocoDaFuncao(controller, 'deferExercise')
    expect(bloco).not.toBe('')
    expect(bloco).toMatch(/nextPendingExercise\(/)
    expect(bloco).toMatch(/focusExercise\(/)
  })

  it('focusExercise é quem escreve o índice atual — sem isso a Ilha Dinâmica congela no exercício pulado', () => {
    const bloco = blocoDaFuncao(controller, 'focusExercise')
    expect(bloco).not.toBe('')
    expect(bloco).toMatch(/setCurrentExerciseIdx\(/)
  })

  it('retomar também traz o foco de volta', () => {
    const bloco = blocoDaFuncao(controller, 'resumeExercise')
    expect(bloco).not.toBe('')
    expect(bloco).toMatch(/focusExercise\(/)
  })
})

describe('o adiado acompanha o remap de índice (classe)', () => {
  /**
   * `collapsed`, `linkedWeights` e `deferred` são TODOS conjuntos de índices de
   * exercício. Quando a lista muda (reordenar, remover, editor completo), quem
   * não for remapeado passa a apontar para o card errado — o selo "FAZER
   * DEPOIS" apareceria num exercício que ninguém guardou.
   *
   * O guard mira em `setCollapsed`, que é o irmão que JÁ existia: cada
   * remapeamento dele tem que ter o do adiado por perto.
   */
  const crud = read('src/components/workout/hooks/useWorkoutExerciseCrud.ts')

  it('todo remapeamento de `collapsed` tem o de `deferredExercises` ao lado', () => {
    const linhas = crud.split('\n')
    const alvos = linhas.reduce<number[]>((acc, linha, i) => {
      // só os REMAPEAMENTOS: o toggle de colapso não mexe em índice de ninguém
      const ehRemap = /remap|i > idx|i - 1/.test(linhas.slice(i, i + 6).join('\n'))
      if (/setCollapsed\(\(prev\)/.test(linha) && ehRemap) acc.push(i)
      return acc
    }, [])
    expect(alvos.length).toBeGreaterThanOrEqual(3)
    for (const i of alvos) {
      const janela = linhas.slice(i, i + 14).join('\n')
      expect(janela).toMatch(/setDeferredExercises\(/)
    }
  })
})
