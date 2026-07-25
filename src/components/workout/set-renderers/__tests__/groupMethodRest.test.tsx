import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GroupMethodSet } from '../groupMethodSet'

/**
 * Guard: descanso do Bi-Set só rola no ÚLTIMO membro do par.
 *
 * INCIDENTE (2026-07-24, run no simulador): concluir a 1ª metade de um Bi-Set
 * (ex.: "Panturrilha sentado") abria um timer de descanso ENTRE as duas metades —
 * contra o próprio enunciado ("0s descanso entre eles") — e mandava o "próxima" pro
 * lugar errado. No device real, o 2º exercício do par ficava frequentemente sem
 * concluir. Causa: handleToggleDone disparava descanso em TODA série concluída.
 *
 * INVARIANTE: concluir o 1º membro (sentado) NÃO descansa (a auto-alternância leva
 * direto ao par); concluir o ÚLTIMO membro (em pé) descansa (fim da rodada). Solo
 * (método de grupo sem par consecutivo) descansa normal.
 */
vi.mock('@/components/ui/HelpHint', () => ({ HelpHint: () => null }))

const startTimer = vi.fn()
let exercises: unknown[] = []
const logByKey: Record<string, Record<string, unknown>> = {}

const ctx = {
  getLog: (k: string) => logByKey[k] ?? {},
  updateLog: vi.fn(),
  setGroupMethodModal: vi.fn(),
  openNotesKeys: new Set<string>(),
  toggleNotes: vi.fn(),
  startTimer,
  getPlanConfig: () => null,
  reportHistory: null,
  get exercises() { return exercises },
  settings: null as Record<string, unknown> | null,
  // consumido por useAutoloadWeight
  autoLoadEnabled: false,
  autoLoadSuggestions: {},
}
vi.mock('../../WorkoutContext', () => ({ useWorkoutContext: () => ctx }))

const biSet = (name: string) => ({ name, method: 'Bi-Set', restTime: 120, sets: 4 })

beforeEach(() => {
  startTimer.mockClear()
  ctx.updateLog.mockClear()
  ctx.settings = null
  for (const k of Object.keys(logByKey)) delete logByKey[k]
  // Série preenchida (peso+reps) → botão "Concluir" habilitado.
  logByKey['0-0'] = { weight: '60', reps: '12' }
  logByKey['1-0'] = { weight: '220', reps: '10' }
})

const clickConcluir = () => fireEvent.click(screen.getByText('Concluir'))

describe('Bi-Set — descanso só no último membro do par', () => {
  it('1ª metade (sentado, position 0) NÃO inicia descanso ao concluir', () => {
    exercises = [biSet('Panturrilha sentado'), biSet('Panturrilha em pé')]
    render(<GroupMethodSet ex={biSet('Panturrilha sentado') as never} exIdx={0} setIdx={0} />)
    clickConcluir()
    expect(ctx.updateLog).toHaveBeenCalled() // marcou done
    expect(startTimer).not.toHaveBeenCalled() // MAS não descansou
  })

  it('último membro (em pé, position 1) INICIA o descanso ao concluir', () => {
    exercises = [biSet('Panturrilha sentado'), biSet('Panturrilha em pé')]
    render(<GroupMethodSet ex={biSet('Panturrilha em pé') as never} exIdx={1} setIdx={0} />)
    clickConcluir()
    expect(startTimer).toHaveBeenCalledTimes(1)
    expect(startTimer).toHaveBeenCalledWith(120, expect.objectContaining({ kind: 'rest' }))
  })

  /**
   * INCIDENTE (relato do dono, 2026-07-25): "concluo o 2º exercício do Bi-Set e o
   * descanso não corre". Treino real `ccdb912b`: 4 Bi-Sets seguidos (Bíceps banco /
   * Tríceps testa / Bíceps corda / Tríceps corda) = DOIS pares, mas o run virava um
   * grupo único de 4 → só o 4º era "último membro" e descansava.
   */
  it('4 Bi-Sets seguidos (dois pares): o 2º fecha o 1º par e DESCANSA', () => {
    exercises = [biSet('Bíceps banco'), biSet('Tríceps testa'), biSet('Bíceps corda'), biSet('Tríceps corda')]
    logByKey['1-0'] = { weight: '30', reps: '10' }
    render(<GroupMethodSet ex={biSet('Tríceps testa') as never} exIdx={1} setIdx={0} />)
    clickConcluir()
    expect(startTimer).toHaveBeenCalledWith(120, expect.objectContaining({ kind: 'rest' }))
  })

  it('4 Bi-Sets seguidos: o 3º ABRE o 2º par e NÃO descansa', () => {
    exercises = [biSet('Bíceps banco'), biSet('Tríceps testa'), biSet('Bíceps corda'), biSet('Tríceps corda')]
    logByKey['2-0'] = { weight: '20', reps: '12' }
    render(<GroupMethodSet ex={biSet('Bíceps corda') as never} exIdx={2} setIdx={0} />)
    clickConcluir()
    expect(startTimer).not.toHaveBeenCalled()
  })

  it('método de grupo SOLO (sem par consecutivo) descansa normal', () => {
    // Um único Bi-Set isolado não forma grupo (precisa de 2 consecutivos).
    exercises = [biSet('Panturrilha sentado'), { name: 'Rosca', method: 'Normal', sets: 3 }]
    render(<GroupMethodSet ex={biSet('Panturrilha sentado') as never} exIdx={0} setIdx={0} />)
    clickConcluir()
    expect(startTimer).toHaveBeenCalledTimes(1)
  })
})

/**
 * Guard: paridade com o normalSet quando o descanso está 0/vazio.
 *
 * O editor SUGERE restTime 0 ao marcar Bi-Set ("0s entre eles"). Quando esse 0 fica
 * no ÚLTIMO membro do par, o fim da rodada não descansava nunca — enquanto a série
 * normal já caía no descanso padrão via `autoRestTimerWhenMissing`.
 */
describe('Bi-Set — fallback de descanso padrão (paridade com a série normal)', () => {
  const biSetZero = (name: string) => ({ name, method: 'Bi-Set', restTime: 0, sets: 4 })

  it('sem a flag, restTime 0 continua sem descanso (comportamento antigo)', () => {
    exercises = [biSetZero('A'), biSetZero('B')]
    logByKey['1-0'] = { weight: '40' }
    render(<GroupMethodSet ex={biSetZero('B') as never} exIdx={1} setIdx={0} />)
    clickConcluir()
    expect(startTimer).not.toHaveBeenCalled()
  })

  it('com autoRestTimerWhenMissing, o último membro usa o descanso padrão', () => {
    ctx.settings = { autoRestTimerWhenMissing: true, restTimerDefaultSeconds: 90 }
    exercises = [biSetZero('A'), biSetZero('B')]
    logByKey['1-0'] = { weight: '40' }
    render(<GroupMethodSet ex={biSetZero('B') as never} exIdx={1} setIdx={0} />)
    clickConcluir()
    expect(startTimer).toHaveBeenCalledWith(90, expect.objectContaining({ kind: 'rest' }))
  })

  it('com a flag, o 1º membro do par continua SEM descanso', () => {
    ctx.settings = { autoRestTimerWhenMissing: true, restTimerDefaultSeconds: 90 }
    exercises = [biSetZero('A'), biSetZero('B')]
    logByKey['0-0'] = { weight: '40' }
    render(<GroupMethodSet ex={biSetZero('A') as never} exIdx={0} setIdx={0} />)
    clickConcluir()
    expect(startTimer).not.toHaveBeenCalled()
  })
})

/**
 * Guard: Concluir do Bi-Set exige SÓ o peso — igual à série normal.
 *
 * INCIDENTE (treino real 2026-07-24): o botão exigia peso E reps e ficava travado em
 * silêncio. O 2º exercício de um Bi-Set ("Panturrilha em pé") terminou o treino com
 * as 4 séries preenchidas e NENHUMA concluída. A série normal (normalSet) sempre
 * concluiu sem reps — divergir aqui não tem razão de ser.
 *
 * INVARIANTE: com peso e SEM reps o botão conclui; sem peso, não.
 */
describe('Bi-Set — Concluir exige só o peso (igual à série normal)', () => {
  it('conclui com peso e SEM reps', () => {
    exercises = [biSet('Panturrilha sentado'), biSet('Panturrilha em pé')]
    logByKey['0-0'] = { weight: '60' } // sem reps
    render(<GroupMethodSet ex={biSet('Panturrilha sentado') as never} exIdx={0} setIdx={0} />)
    clickConcluir()
    expect(ctx.updateLog).toHaveBeenCalledWith('0-0', expect.objectContaining({ done: true }))
  })

  it('SEM peso continua bloqueado (e explica o que falta)', () => {
    exercises = [biSet('Panturrilha sentado'), biSet('Panturrilha em pé')]
    logByKey['0-0'] = {} // sem peso
    render(<GroupMethodSet ex={biSet('Panturrilha sentado') as never} exIdx={0} setIdx={0} />)
    clickConcluir()
    expect(ctx.updateLog).not.toHaveBeenCalled()
    expect(screen.getByText('Preencha o peso para concluir.')).toBeTruthy()
  })
})
