import { render } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NormalSet } from '../normalSet'
import { logWarnRemote } from '@/lib/logger'

/**
 * O aviso `workout.input.persisted-value-vanished` chega SEMPRE em par — L_ e R_
 * do mesmo campo, no mesmo instante, mais de 2 s depois da última tecla
 * (Sentry JAVASCRIPT-NEXTJS-1C/1D/19/1A, ~40 eventos em 29/09/2026). É a
 * assinatura de uma cópia velha do log sobrescrevendo a local, mas o aviso não
 * dizia o que mais havia no log naquela hora — e sem isso não dá para apontar
 * QUEM escreveu. Este guard cobra que o retrato viaje junto.
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

const ex = { name: 'Rosca alternada', method: 'Normal', sets: 3, restTime: 60, isUnilateral: true }

beforeEach(() => { vi.mocked(logWarnRemote).mockClear(); logStore = {} })

describe('valor que some do log leva o retrato do log no aviso', () => {
  it('o par L_/R_ reporta as chaves do log e se havia valor compartilhado', () => {
    logStore = { L_rpe: '8', R_rpe: '8', L_weight: '12', R_weight: '12' }
    const { rerender } = render(<NormalSet ex={ex as never} exIdx={0} setIdx={0} setsCount={3} />)

    // Uma cópia velha do log chega SEM o RPE, sem ninguém ter tocado no campo.
    logStore = { L_weight: '12', R_weight: '12' }
    rerender(<NormalSet ex={{ ...ex } as never} exIdx={0} setIdx={0} setsCount={3} />)

    const avisos = vi.mocked(logWarnRemote).mock.calls.filter(([c]) => c === 'workout.input.persisted-value-vanished')
    expect(avisos.map(([, , d]) => (d as Record<string, unknown>).field).sort()).toEqual(['L_rpe', 'R_rpe'])
    for (const [, , detalhe] of avisos) {
      const d = detalhe as Record<string, unknown>
      expect(d.chavesDoLog).toBe('L_weight,R_weight')
      expect(d.temRpeCompartilhado).toBe(false)
      expect(d.done).toBe(false)
    }
  })
})
