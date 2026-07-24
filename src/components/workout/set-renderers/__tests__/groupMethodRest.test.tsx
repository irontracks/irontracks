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
  // consumido por useAutoloadWeight
  autoLoadEnabled: false,
  autoLoadSuggestions: {},
}
vi.mock('../../WorkoutContext', () => ({ useWorkoutContext: () => ctx }))

const biSet = (name: string) => ({ name, method: 'Bi-Set', restTime: 120, sets: 4 })

beforeEach(() => {
  startTimer.mockClear()
  ctx.updateLog.mockClear()
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

  it('método de grupo SOLO (sem par consecutivo) descansa normal', () => {
    // Um único Bi-Set isolado não forma grupo (precisa de 2 consecutivos).
    exercises = [biSet('Panturrilha sentado'), { name: 'Rosca', method: 'Normal', sets: 3 }]
    render(<GroupMethodSet ex={biSet('Panturrilha sentado') as never} exIdx={0} setIdx={0} />)
    clickConcluir()
    expect(startTimer).toHaveBeenCalledTimes(1)
  })
})
