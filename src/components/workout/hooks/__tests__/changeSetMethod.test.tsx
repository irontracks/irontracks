/**
 * Trocar o método de UMA série — "só neste treino" ou "salvar no plano".
 *
 * Até 01/09/2026 o seletor gravava direto em `logs["ex-set"].per_set_method`,
 * que morre com a sessão: quem trocava Drop-Set → Normal refazia a troca toda
 * semana e nada na tela dizia que aquilo era temporário. É o mesmo defeito que
 * `askPersistSetChange` corrigiu para adicionar/remover série.
 *
 * Os dois invariantes que quebram em silêncio:
 *  1. a escolha vale HOJE independentemente da resposta (e mesmo se o diálogo
 *     falhar) — o toque no seletor não pode ficar sem efeito;
 *  2. o plano só é gravado quando o usuário pediu.
 */
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useWorkoutExerciseCrud } from '@/components/workout/hooks/useWorkoutExerciseCrud'

type Deps = Parameters<typeof useWorkoutExerciseCrud>[0]

function setup(opts?: { confirm?: () => Promise<boolean>; semPersistidor?: boolean }) {
  const exercises = [
    { name: 'Chest press máquina', sets: 3, setDetails: [{ set_number: 1 }, { set_number: 2 }, { set_number: 3 }] },
  ]
  const workout = { id: 'w1', exercises }
  const updateLog = vi.fn()
  const onUpdateSession = vi.fn()
  const onPersistWorkoutTemplate = vi.fn()
  const confirm = vi.fn(opts?.confirm ?? (async () => true))
  const deps = {
    workout,
    exercises,
    logs: {},
    getLog: () => ({}),
    updateLog,
    collapsed: new Set<number>(),
    setCollapsed: vi.fn(),
    linkedWeightExercises: new Set<number>(),
    setLinkedWeightExercises: vi.fn(),
    onUpdateSession,
    onPersistWorkoutTemplate: opts?.semPersistidor ? undefined : onPersistWorkoutTemplate,
    alert: vi.fn(async () => {}),
    confirm,
  } as unknown as Deps

  const { result } = renderHook(() => useWorkoutExerciseCrud(deps))
  return { result, updateLog, onUpdateSession, onPersistWorkoutTemplate, confirm }
}

const metodoGravadoNoPlano = (fn: ReturnType<typeof vi.fn>, exIdx: number, setIdx: number) => {
  const w = fn.mock.calls[0][0] as { exercises: Array<{ setDetails: Array<Record<string, unknown>> }> }
  return w.exercises[exIdx].setDetails[setIdx].per_set_method ?? null
}

describe('changeSetMethod', () => {
  it('a escolha vale HOJE antes de qualquer pergunta', async () => {
    const { result, updateLog, confirm } = setup()
    await act(async () => { await result.current.changeSetMethod(0, 2, 'Drop-Set') })
    expect(updateLog).toHaveBeenCalledWith('0-2', expect.objectContaining({ per_set_method: 'Drop-Set' }))
    expect(confirm).toHaveBeenCalled()
  })

  it('"Só neste treino" NÃO grava no plano', async () => {
    const { result, onPersistWorkoutTemplate } = setup({ confirm: async () => true })
    await act(async () => { await result.current.changeSetMethod(0, 1, 'Cluster') })
    expect(onPersistWorkoutTemplate).not.toHaveBeenCalled()
  })

  it('"Salvar no plano" grava o método NA SÉRIE escolhida', async () => {
    const { result, onPersistWorkoutTemplate } = setup({ confirm: async () => false })
    await act(async () => { await result.current.changeSetMethod(0, 1, 'Cluster') })
    expect(onPersistWorkoutTemplate).toHaveBeenCalledTimes(1)
    expect(metodoGravadoNoPlano(onPersistWorkoutTemplate, 0, 1)).toBe('Cluster')
    expect(metodoGravadoNoPlano(onPersistWorkoutTemplate, 0, 0)).toBeNull()
  })

  it('"Só neste treino" é o botão em DESTAQUE — mexer no plano exige escolha consciente', async () => {
    const { result, confirm } = setup()
    await act(async () => { await result.current.changeSetMethod(0, 0, 'Stripping') })
    expect(confirm.mock.calls[0][2]).toMatchObject({
      confirmText: 'Só neste treino',
      cancelText: 'Salvar no plano',
    })
  })

  it('diálogo que FALHA mantém a troca na sessão e não toca no plano', async () => {
    const { result, updateLog, onPersistWorkoutTemplate } = setup({
      confirm: async () => { throw new Error('sem provider') },
    })
    await act(async () => { await result.current.changeSetMethod(0, 0, 'FST-7') })
    expect(updateLog).toHaveBeenCalledWith('0-0', expect.objectContaining({ per_set_method: 'FST-7' }))
    expect(onPersistWorkoutTemplate).not.toHaveBeenCalled()
  })

  it('sem persistidor não pergunta nada — e a troca continua valendo hoje', async () => {
    const { result, updateLog, confirm } = setup({ semPersistidor: true })
    await act(async () => { await result.current.changeSetMethod(0, 0, 'Onda') })
    expect(updateLog).toHaveBeenCalledWith('0-0', expect.objectContaining({ per_set_method: 'Onda' }))
    expect(confirm).not.toHaveBeenCalled()
  })

  it('o patch extra do renderer normal (advanced_config) chega junto', async () => {
    const { result, updateLog } = setup()
    await act(async () => {
      await result.current.changeSetMethod(0, 0, 'Drop-Set', { advanced_config: [{ weight: 40 }] })
    })
    expect(updateLog).toHaveBeenCalledWith('0-0', {
      advanced_config: [{ weight: 40 }],
      per_set_method: 'Drop-Set',
    })
  })

  it('método vazio não faz nada — nem sessão, nem pergunta', async () => {
    const { result, updateLog, confirm } = setup()
    await act(async () => { await result.current.changeSetMethod(0, 0, '  ') })
    expect(updateLog).not.toHaveBeenCalled()
    expect(confirm).not.toHaveBeenCalled()
  })
})
