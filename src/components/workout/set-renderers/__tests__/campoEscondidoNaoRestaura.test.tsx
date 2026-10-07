import { render } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NormalSet } from '../normalSet'
import { logWarnRemote } from '@/lib/logger'

/**
 * A série normal monta os campos dos DOIS modos (bilateral e L_/R_) e só desenha
 * um. Os de lado espelham o compartilhado (`L_rpe ?? rpe`): numa série BILATERAL,
 * apagar o RPE fazia o L_rpe escondido "perder" o valor, restaurá-lo e gravar
 * L_rpe/R_rpe na série bilateral (Sentry JAVASCRIPT-NEXTJS-1C/1D/19/1A — todos os
 * eventos eram de série bilateral). Medido em 07/10/2026: 465 séries bilaterais
 * com campos de lado em 153 treinos, e `setTotalReps` somando L+R no lugar de
 * `reps`. Guard de CLASSE: varre os campos escondidos dos dois modos.
 */
vi.mock('@/components/ui/HelpHint', () => ({ HelpHint: () => null }))
vi.mock('@/lib/logger', () => ({ logWarnRemote: vi.fn(), logError: vi.fn() }))

let logStore: Record<string, unknown> = {}
const ctx = {
  get getLog() { return () => logStore },
  updateLog: vi.fn(),
  getPlanConfig: () => null,
  getPlannedSet: () => null,
  startTimer: vi.fn(),
  openNotesKeys: new Set<string>(),
  toggleNotes: vi.fn(),
  reportHistory: null,
  deloadSuggestions: {},
  autoLoadEnabled: false,
  autoLoadSuggestions: {},
  updateSetType: vi.fn(),
  collapsed: new Set<number>(),
  setCollapsed: vi.fn(),
  exercises: [],
}
vi.mock('../../WorkoutContext', () => ({ useWorkoutContext: () => ctx }))

const escritas = () => ctx.updateLog.mock.calls.map(([, patch]) => Object.keys(patch as object)).flat()
const avisos = () => vi.mocked(logWarnRemote).mock.calls.filter(([c]) => c === 'workout.input.persisted-value-vanished')

beforeEach(() => { vi.mocked(logWarnRemote).mockClear(); ctx.updateLog.mockClear(); logStore = {} })

describe('campo do modo escondido nunca restaura valor no log', () => {
  const bilateral = { name: 'Remada sentada triângulo', method: 'Normal', sets: 3, restTime: 60, isUnilateral: false }

  it.each(['rpe', 'reps', 'weight'])('série bilateral: apagar %s não grava L_/R_', (campo) => {
    logStore = { weight: '40', reps: '10', rpe: '8' }
    const { rerender } = render(<NormalSet ex={bilateral as never} exIdx={4} setIdx={2} setsCount={3} />)
    const semCampo = { ...logStore }
    delete semCampo[campo]
    logStore = semCampo
    rerender(<NormalSet ex={{ ...bilateral } as never} exIdx={4} setIdx={2} setsCount={3} />)

    expect(escritas().filter((k) => /^[LR]_/.test(k))).toEqual([])
    // O campo compartilhado é o VISÍVEL aqui e pode restaurar; o de lado, não.
    expect(avisos().map(([, , d]) => (d as Record<string, unknown>).field).filter((f) => /^[LR]_/.test(String(f)))).toEqual([])
  })

  it('série unilateral: o compartilhado escondido não regrava weight/reps/rpe', () => {
    const uni = { name: 'Puxada alta unilateral', method: 'Normal', sets: 3, restTime: 60, isUnilateral: true }
    logStore = { weight: '40', reps: '10', rpe: '8', L_weight: '20', R_weight: '20' }
    const { rerender } = render(<NormalSet ex={uni as never} exIdx={3} setIdx={0} setsCount={3} />)
    logStore = { L_weight: '20', R_weight: '20' }
    rerender(<NormalSet ex={{ ...uni } as never} exIdx={3} setIdx={0} setsCount={3} />)

    expect(escritas().filter((k) => k === 'weight' || k === 'reps' || k === 'rpe')).toEqual([])
  })

  it('o campo VISÍVEL continua restaurando (a defesa original não morreu)', () => {
    const uni = { name: 'Rosca alternada', method: 'Normal', sets: 3, restTime: 60, isUnilateral: true }
    logStore = { L_rpe: '8', R_rpe: '8' }
    const { rerender } = render(<NormalSet ex={uni as never} exIdx={0} setIdx={0} setsCount={3} />)
    logStore = {}
    rerender(<NormalSet ex={{ ...uni } as never} exIdx={0} setIdx={0} setsCount={3} />)

    expect(escritas().sort()).toEqual(['L_rpe', 'R_rpe'])
  })
})
