/**
 * Série acrescentada com 🔗 ligado nasce com o peso das irmãs.
 *
 * A sincronização promete "todas as séries", e a série nova nascia vazia — ou
 * com a sugestão do motor, diferente do peso que o usuário tinha acabado de
 * sincronizar. A semente vai SEM `weightSource: 'user'`: com ele o `updateLog`
 * trataria a semente como edição e re-replicaria sobre as outras séries.
 */
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useWorkoutExerciseCrud } from '@/components/workout/hooks/useWorkoutExerciseCrud'

type Deps = Parameters<typeof useWorkoutExerciseCrud>[0]

function setup(opts: { vinculado: boolean; logs: Record<string, Record<string, unknown>> }) {
  const exercises = [{ name: 'Cadeira flexora unilateral', sets: 3, setDetails: [{}, {}, {}] }]
  const updateLog = vi.fn()
  const deps = {
    workout: { id: 'w1', exercises },
    exercises,
    logs: opts.logs,
    getLog: (k: string) => opts.logs[k] ?? {},
    updateLog,
    collapsed: new Set<number>(),
    setCollapsed: vi.fn(),
    setDeferredExercises: vi.fn(),
    linkedWeightExercises: new Set<number>(opts.vinculado ? [0] : []),
    setLinkedWeightExercises: vi.fn(),
    onUpdateSession: vi.fn(),
    onPersistWorkoutTemplate: undefined,
    alert: vi.fn(async () => {}),
    confirm: vi.fn(async () => true),
  } as unknown as Deps
  const { result } = renderHook(() => useWorkoutExerciseCrud(deps))
  return { result, updateLog }
}

describe('série nova com 🔗 ligado', () => {
  it('bilateral: nasce com o peso da última série', async () => {
    const { result, updateLog } = setup({ vinculado: true, logs: { '0-2': { weight: '25', weightSource: 'user', reps: '10' } } })
    await act(async () => { await result.current.addExtraSetToExercise(0) })
    expect(updateLog).toHaveBeenCalledWith('0-3', { weight: '25' })
  })

  it('unilateral: leva os dois lados e a marca de espelho', async () => {
    const { result, updateLog } = setup({
      vinculado: true,
      logs: { '0-2': { L_weight: '23', R_weight: '23', weightMirroredSide: 'R_weight', weightSource: 'user' } },
    })
    await act(async () => { await result.current.addExtraSetToExercise(0) })
    expect(updateLog).toHaveBeenCalledWith('0-3', { L_weight: '23', R_weight: '23', weightMirroredSide: 'R_weight' })
  })

  it('a semente NÃO é edição do usuário — senão re-replicaria sobre as outras', async () => {
    const { result, updateLog } = setup({ vinculado: true, logs: { '0-2': { weight: '25', weightSource: 'user' } } })
    await act(async () => { await result.current.addExtraSetToExercise(0) })
    const patch = updateLog.mock.calls[0]?.[1] as Record<string, unknown>
    expect(patch).not.toHaveProperty('weightSource')
    expect(patch).not.toHaveProperty('reps')
  })

  it('🔗 desligado: nada é semeado', async () => {
    const { result, updateLog } = setup({ vinculado: false, logs: { '0-2': { weight: '25', weightSource: 'user' } } })
    await act(async () => { await result.current.addExtraSetToExercise(0) })
    expect(updateLog).not.toHaveBeenCalled()
  })

  it('sem peso nas irmãs: nada é semeado', async () => {
    const { result, updateLog } = setup({ vinculado: true, logs: {} })
    await act(async () => { await result.current.addExtraSetToExercise(0) })
    expect(updateLog).not.toHaveBeenCalled()
  })
})
