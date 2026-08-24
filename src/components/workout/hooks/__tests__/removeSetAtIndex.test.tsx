/**
 * Remover UMA série pelo índice — não só a última.
 *
 * A lixeira do card sempre foi um `pop()` cego: quem queria tirar a 2ª de quatro
 * séries tinha que apagar as de cima e refazer (relato do dono, 19/08/2026).
 *
 * O invariante que quebra em silêncio não é a contagem — é o MAPA DE LOGS.
 * Ele é indexado por `"exIdx-setIdx"`, então tirar do meio obriga a deslizar as
 * chaves seguintes; sem isso a série 2 passa a exibir o peso que era da 3, e o
 * usuário só descobre olhando o histórico depois.
 */
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderHook, act } from '@testing-library/react'
import { useWorkoutExerciseCrud } from '@/components/workout/hooks/useWorkoutExerciseCrud'

type Deps = Parameters<typeof useWorkoutExerciseCrud>[0]

function setup(opts?: { logs?: Record<string, unknown>; sets?: number }) {
  const setsCount = opts?.sets ?? 4
  const exercises = [
    {
      name: 'Crucifixo inverso',
      sets: setsCount,
      setDetails: Array.from({ length: setsCount }, (_, i) => ({ set_number: i + 1, reps: String(10 + i) })),
    },
  ]
  const workout = { id: 'w1', exercises }
  const onUpdateSession = vi.fn()
  const deps = {
    workout,
    exercises,
    logs: opts?.logs ?? {},
    getLog: () => ({}),
    collapsed: new Set<number>(),
    setCollapsed: vi.fn(),
    linkedWeightExercises: new Set<number>(),
    setLinkedWeightExercises: vi.fn(),
    onUpdateSession,
    // Sem persistidor de template: o prompt "só hoje ou no plano?" não roda,
    // e o teste mede a remoção, não o diálogo (que tem guard próprio).
    onPersistWorkoutTemplate: undefined,
    alert: vi.fn(async () => {}),
    confirm: vi.fn(async () => true),
  } as unknown as Deps

  const { result } = renderHook(() => useWorkoutExerciseCrud(deps))
  return { result, onUpdateSession }
}

const nextWorkout = (onUpdateSession: ReturnType<typeof vi.fn>) =>
  (onUpdateSession.mock.calls[0][0] as { workout: { exercises: Record<string, unknown>[] }; logs: Record<string, unknown> })

describe('removeSetAtIndex — remove a série escolhida, não a última', () => {
  it('tira a série do MEIO e decrementa a contagem', async () => {
    const { result, onUpdateSession } = setup()
    await act(async () => { await result.current.removeSetAtIndex(0, 1) })

    const { workout } = nextWorkout(onUpdateSession)
    const ex = workout.exercises[0]
    expect(ex.sets).toBe(3)
    const sd = ex.setDetails as Array<Record<string, unknown>>
    expect(sd).toHaveLength(3)
    // a série removida é a de reps '11' (índice 1), não a última ('13')
    expect(sd.map((d) => d.reps)).toEqual(['10', '12', '13'])
  })

  it('renumera set_number do que sobrou (é o rótulo do relatório)', async () => {
    const { result, onUpdateSession } = setup()
    await act(async () => { await result.current.removeSetAtIndex(0, 0) })

    const sd = nextWorkout(onUpdateSession).workout.exercises[0].setDetails as Array<Record<string, unknown>>
    expect(sd.map((d) => d.set_number)).toEqual([1, 2, 3])
  })

  it('DESLIZA os logs seguintes — série 2 não pode herdar o peso da 3', async () => {
    const logs = {
      '0-0': { weight: '50' },
      '0-1': { weight: '60' },
      '0-2': { weight: '70' },
      '0-3': { weight: '80' },
      '1-0': { weight: '999' }, // outro exercício: intocado
    }
    const { result, onUpdateSession } = setup({ logs })
    await act(async () => { await result.current.removeSetAtIndex(0, 1) })

    const next = nextWorkout(onUpdateSession).logs as Record<string, { weight: string }>
    expect(next['0-0'].weight).toBe('50')
    expect(next['0-1'].weight).toBe('70')
    expect(next['0-2'].weight).toBe('80')
    expect(next['0-3']).toBeUndefined()
    expect(next['1-0'].weight).toBe('999')
  })

  it('não remove a única série que sobrou', async () => {
    const { result, onUpdateSession } = setup({ sets: 1 })
    await act(async () => { await result.current.removeSetAtIndex(0, 0) })
    expect(onUpdateSession).not.toHaveBeenCalled()
  })

  it('índice fora da faixa não faz nada', async () => {
    const { result, onUpdateSession } = setup()
    await act(async () => { await result.current.removeSetAtIndex(0, 9) })
    expect(onUpdateSession).not.toHaveBeenCalled()
  })

  it('não muta o estado original', async () => {
    const logs = { '0-3': { weight: '80' } }
    const { result } = setup({ logs })
    await act(async () => { await result.current.removeSetAtIndex(0, 0) })
    expect(logs['0-3']).toBeDefined()
  })
})

describe('fiação: o card do exercício usa a remoção POR ÍNDICE', () => {
  const CARD = readFileSync(join(process.cwd(), 'src/components/workout/ExerciseCard.tsx'), 'utf8')

  it('a lixeira abre a escolha da série e remove pelo índice escolhido', () => {
    // O 3º argumento (`freezeMethods`) entrou em 24/08/2026: sem ele o método
    // INFERIDO pela nota do exercício escorrega para a série vizinha.
    expect(CARD).toMatch(/removeSetAtIndex\(exIdx,\s*sIdx,/)
    expect(CARD).toMatch(/freezeMethods:\s*freezeInferredMethodsBeforeRemoval\(sIdx\)/)
  })

  it('não voltou a apagar a última série às cegas', () => {
    // `removeExtraSetFromExercise` segue existindo no controller (atalho legado),
    // mas o card não pode mais chamá-lo: era exatamente o pop cego.
    expect(CARD).not.toMatch(/removeExtraSetFromExercise\(/)
  })
})

/**
 * O drop que ESCORREGA — bug relatado em 24/08/2026.
 *
 * A nota do exercício dizia "DROP-SET **na última série**", e o drop é injetado
 * por `getPlannedSet` em quem for a última. Remover a série 3 (o drop) fazia a
 * série 2 virar a última e herdar o método: para o dono, o app tinha "apagado a
 * série errada" — o drop continuava na tela, uma linha acima.
 *
 * O congelamento precisa acontecer NA MESMA escrita da remoção. A primeira
 * tentativa gravou os métodos com `updateLog` logo antes de chamar isto, e o
 * `nextLogs` — montado a partir do `logs` do render atual — sobrescreveu tudo.
 * Passou nos testes e falhou no aparelho; por isso estes casos exercitam o
 * parâmetro, não duas chamadas separadas.
 */
describe('removeSetAtIndex — congela o método das séries que ficam', () => {
  it('marca a série que ficaria como última, mesmo sem log ainda', async () => {
    const { result, onUpdateSession } = setup({ sets: 3 })
    await act(async () => {
      await result.current.removeSetAtIndex(0, 2, { freezeMethods: { 0: 'Normal', 1: 'Normal' } })
    })

    const next = nextWorkout(onUpdateSession).logs as Record<string, { per_set_method?: string }>
    // Série sem log é o caso COMUM: o usuário não tocou nela e ela viraria drop.
    expect(next['0-1']?.per_set_method).toBe('Normal')
    expect(next['0-0']?.per_set_method).toBe('Normal')
  })

  it('preserva o que já havia no log ao congelar', async () => {
    const logs = { '0-0': { weight: '50' }, '0-1': { weight: '60' }, '0-2': { weight: '70' } }
    const { result, onUpdateSession } = setup({ sets: 3, logs })
    await act(async () => {
      await result.current.removeSetAtIndex(0, 2, { freezeMethods: { 1: 'Normal' } })
    })

    const next = nextWorkout(onUpdateSession).logs as Record<string, { weight?: string; per_set_method?: string }>
    expect(next['0-1']).toEqual({ weight: '60', per_set_method: 'Normal' })
  })

  it('congela pelo índice ORIGINAL e grava no índice já deslizado', async () => {
    const logs = { '0-0': { weight: '50' }, '0-1': { weight: '60' }, '0-2': { weight: '70' }, '0-3': { weight: '80' } }
    const { result, onUpdateSession } = setup({ sets: 4, logs })
    // Remove a 2ª: a 4ª (índice 3) carregava o método e vira índice 2.
    await act(async () => {
      await result.current.removeSetAtIndex(0, 1, { freezeMethods: { 3: 'Drop-Set' } })
    })

    const next = nextWorkout(onUpdateSession).logs as Record<string, { weight?: string; per_set_method?: string }>
    expect(next['0-2']).toEqual({ weight: '80', per_set_method: 'Drop-Set' })
    expect(next['0-1']?.per_set_method).toBeUndefined()
  })

  it('sem `freezeMethods` nada é marcado — a remoção simples não inventa método', async () => {
    const logs = { '0-0': { weight: '50' }, '0-1': { weight: '60' } }
    const { result, onUpdateSession } = setup({ sets: 2, logs })
    await act(async () => { await result.current.removeSetAtIndex(0, 1) })

    const next = nextWorkout(onUpdateSession).logs as Record<string, { per_set_method?: string }>
    expect(next['0-0']?.per_set_method).toBeUndefined()
  })
})
