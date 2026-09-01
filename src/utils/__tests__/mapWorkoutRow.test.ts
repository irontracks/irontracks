import { describe, it, expect, vi } from 'vitest'

// Mock logger to avoid side-effects
vi.mock('@/lib/logger', () => ({
  logError: vi.fn(),
  logWarn: vi.fn(),
  logInfo: vi.fn(),
}))

import { mapWorkoutRow } from '@/utils/mapWorkoutRow'

// ────────────────────────────────────────────────────────────────────────────
// Fixtures
// ────────────────────────────────────────────────────────────────────────────
const BASIC_ROW = {
  id: 'w1',
  name: 'Treino A',
  notes: 'Push day',
  is_template: true,
  user_id: 'u1',
  created_by: 'u1',
  archived_at: null,
  sort_order: 2,
  created_at: '2026-01-01T00:00:00Z',
  exercises: [
    {
      id: 'e1',
      name: 'Supino Reto',
      order: 2,
      method: null,
      notes: null,
      video_url: null,
      rest_time: 60,
      cadence: '2011',
      sets: [
        { set_number: 1, reps: 10, rpe: 8, weight: 80, is_warmup: false },
        { set_number: 2, reps: 10, rpe: 9, weight: 80, is_warmup: false },
      ],
    },
    {
      id: 'e2',
      name: 'Crucifixo',
      order: 1,
      method: null,
      notes: null,
      video_url: null,
      rest_time: 45,
      cadence: null,
      sets: [],
    },
  ],
}

// ────────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────────
describe('mapWorkoutRow', () => {
  describe('top-level fields', () => {
    it('maps id, title, notes correctly', () => {
      const r = mapWorkoutRow(BASIC_ROW)
      expect(r.id).toBe('w1')
      expect(r.title).toBe('Treino A')
      expect(r.notes).toBe('Push day')
    })

    it('maps is_template, userId, createdBy', () => {
      const r = mapWorkoutRow(BASIC_ROW)
      expect(r.is_template).toBe(true)
      expect(r.userId).toBe('u1')
      expect(r.createdBy).toBe('u1')
    })

    it('maps sortOrder as number', () => {
      const r = mapWorkoutRow(BASIC_ROW)
      expect(r.sortOrder).toBe(2)
    })

    it('defaults sortOrder to 0 for null', () => {
      const r = mapWorkoutRow({ ...BASIC_ROW, sort_order: null })
      expect(r.sortOrder).toBe(0)
    })

    it('coerces string sortOrder', () => {
      const r = mapWorkoutRow({ ...BASIC_ROW, sort_order: '5' })
      expect(r.sortOrder).toBe(5)
    })

    it('defaults title to empty string for missing name', () => {
      const r = mapWorkoutRow({ exercises: [] })
      expect(r.title).toBe('')
    })
  })

  describe('exercises ordering and filtering', () => {
    it('sorts exercises by order field', () => {
      const r = mapWorkoutRow(BASIC_ROW)
      const exs = r.exercises as { id: string }[]
      expect(exs[0].id).toBe('e2') // order=1
      expect(exs[1].id).toBe('e1') // order=2
    })

    it('filters out non-object entries from exercises', () => {
      const row = { exercises: [null, undefined, 'string', { id: 'e1', name: 'A', order: 1, sets: [] }] }
      const r = mapWorkoutRow(row)
      expect((r.exercises as unknown[]).length).toBe(1)
    })
  })

  describe('sets and setDetails', () => {
    it('maps set_details correctly', () => {
      const r = mapWorkoutRow(BASIC_ROW)
      const exs = r.exercises as { setDetails: { set_number: number; reps: number }[] }[]
      const supino = exs.find(e => (e as unknown as { name: string }).name === 'Supino Reto')!
      expect(supino.setDetails).toHaveLength(2)
      expect(supino.setDetails[0].reps).toBe(10)
    })

    it('sorts sets by set_number', () => {
      const row = {
        exercises: [{
          id: 'e1', name: 'Ex', order: 1, sets: [
            { set_number: 3, reps: 5 },
            { set_number: 1, reps: 10 },
            { set_number: 2, reps: 8 },
          ],
        }],
      }
      const r = mapWorkoutRow(row)
      const exs = r.exercises as { setDetails: { set_number: number }[] }[]
      expect(exs[0].setDetails[0].set_number).toBe(1)
      expect(exs[0].setDetails[2].set_number).toBe(3)
    })

    it('defaults to 4 sets when no sets data (non-cardio)', () => {
      const row = { exercises: [{ id: 'e1', name: 'Ex', order: 1, sets: [] }] }
      const r = mapWorkoutRow(row)
      const exs = r.exercises as { sets: number }[]
      expect(exs[0].sets).toBe(4)
    })
  })

  describe('cardio exercises', () => {
    it('uses cardio defaults (reps=20, rpe=5, sets=1)', () => {
      const row = {
        exercises: [{
          id: 'e1', name: 'Esteira', order: 1, method: 'cardio', sets: [],
        }],
      }
      const r = mapWorkoutRow(row)
      const exs = r.exercises as { reps: string; rpe: number; sets: number }[]
      expect(exs[0].reps).toBe('20')
      expect(exs[0].rpe).toBe(5)
      expect(exs[0].sets).toBe(1)
    })
  })

  describe('unilateral flag preservation', () => {
    it('maps is_unilateral → isUnilateral when true', () => {
      const row = {
        exercises: [{
          id: 'e1', name: 'Cadeira flexora unilateral', order: 1,
          is_unilateral: true, side_rest_time: 30, transition_time: null,
          sets: [],
        }],
      }
      const r = mapWorkoutRow(row)
      const exs = r.exercises as { isUnilateral: boolean; sideRestTime: number | null; transitionTime: number | null }[]
      expect(exs[0].isUnilateral).toBe(true)
      expect(exs[0].sideRestTime).toBe(30)
      expect(exs[0].transitionTime).toBeNull()
    })

    it('maps is_unilateral → isUnilateral false when absent', () => {
      const row = {
        exercises: [{
          id: 'e1', name: 'Supino', order: 1, sets: [],
        }],
      }
      const r = mapWorkoutRow(row)
      const exs = r.exercises as { isUnilateral: boolean }[]
      expect(exs[0].isUnilateral).toBe(false)
    })

    it('preserves sideRestTime and transitionTime independently', () => {
      const row = {
        exercises: [{
          id: 'e1', name: 'Ex', order: 1,
          is_unilateral: true, side_rest_time: 45, transition_time: 10,
          sets: [],
        }],
      }
      const r = mapWorkoutRow(row)
      const exs = r.exercises as { sideRestTime: number; transitionTime: number }[]
      expect(exs[0].sideRestTime).toBe(45)
      expect(exs[0].transitionTime).toBe(10)
    })
  })

  describe('edge cases', () => {
    it('handles null input', () => {
      const r = mapWorkoutRow(null)
      expect(r.title).toBe('')
      expect(r.exercises).toEqual([])
    })

    it('handles undefined input', () => {
      const r = mapWorkoutRow(undefined)
      expect(r.title).toBe('')
      expect(r.exercises).toEqual([])
    })

    it('handles empty object input', () => {
      const r = mapWorkoutRow({})
      expect(r.title).toBe('')
      expect(r.exercises).toEqual([])
    })

    it('handles is_warmup via camelCase alias', () => {
      const row = {
        exercises: [{
          id: 'e1', name: 'Ex', order: 1,
          sets: [{ set_number: 1, isWarmup: true }],
        }],
      }
      const r = mapWorkoutRow(row)
      const exs = r.exercises as { setDetails: { is_warmup: boolean }[] }[]
      expect(exs[0].setDetails[0].is_warmup).toBe(true)
    })

    it('liga método por série a partir das notas (drop na última série)', () => {
      const row = {
        exercises: [{
          id: 'e1', name: 'Supino', order: 1, method: 'Normal',
          notes: 'DROP-SET na última série: até a falha → reduz ~20% → continua',
          sets: [
            { set_number: 1, reps: 10, weight: 80 },
            { set_number: 2, reps: 10, weight: 80 },
            { set_number: 3, reps: 10, weight: 80 },
          ],
        }],
      }
      const r = mapWorkoutRow(row)
      const ex = (r.exercises as { method: string; setDetails: { advanced_config: unknown }[] }[])[0]
      // exercício segue Normal; só a última série vira drop
      expect(ex.method).toBe('Normal')
      expect(ex.setDetails[0].advanced_config ?? null).toBeNull()
      expect(ex.setDetails[1].advanced_config ?? null).toBeNull()
      expect(Array.isArray(ex.setDetails[2].advanced_config)).toBe(true)
    })

    it('não sobrescreve advanced_config já existente vindo do banco', () => {
      const cfg = { mini_sets: 3, rest_time_sec: 20 }
      const row = {
        exercises: [{
          id: 'e1', name: 'Supino', order: 1, method: 'Normal',
          notes: 'DROP na última: 10 > 8 > 6',
          sets: [
            { set_number: 1, reps: 10 },
            { set_number: 2, reps: 10 },
            { set_number: 3, reps: 10, advanced_config: cfg },
          ],
        }],
      }
      const r = mapWorkoutRow(row)
      const ex = (r.exercises as { setDetails: { advanced_config: unknown }[] }[])[0]
      expect(ex.setDetails[2].advanced_config).toEqual(cfg)
    })
  })
})

describe('arquivamento — a lista lê `archived_at`, não `archivedAt`', () => {
  /*
   * O mapeamento emitia só a camelCase e a UI inteira de arquivamento era letra
   * morta: `StudentDashboard` filtra com `!w?.archived_at`, `WorkoutCard` decide
   * o badge "Arquivado" e o botão de restaurar pela mesma chave. Resultado visto
   * no simulador (04/08/2026): treino arquivado continuava na lista como se nada
   * tivesse acontecido.
   */
  it('emite as duas grafias com a data', () => {
    const r = mapWorkoutRow({ id: 'w1', name: 'A', archived_at: '2026-08-04T12:00:00Z', exercises: [] }) as Record<string, unknown>
    expect(r.archived_at).toBe('2026-08-04T12:00:00Z')
    expect(r.archivedAt).toBe('2026-08-04T12:00:00Z')
  })

  it('treino ativo continua com null nas duas', () => {
    const r = mapWorkoutRow({ id: 'w1', name: 'A', archived_at: null, exercises: [] }) as Record<string, unknown>
    expect(r.archived_at).toBeNull()
    expect(r.archivedAt).toBeNull()
  })

  it('o filtro da lista esconde o arquivado e mantém o ativo', () => {
    // Reproduz o filtro real do StudentDashboard sobre a saída do mapeamento.
    const rows = [
      mapWorkoutRow({ id: 'a', name: 'Ativo', archived_at: null, exercises: [] }),
      mapWorkoutRow({ id: 'b', name: 'Arquivado', archived_at: '2026-08-04T12:00:00Z', exercises: [] }),
    ] as Array<Record<string, unknown>>
    const visiveis = rows.filter((w) => !w?.archived_at)
    expect(visiveis).toHaveLength(1)
    expect(visiveis[0]!.title).toBe('Ativo')
  })
})

/**
 * Método por série salvo NO PLANO (`sets.per_set_method`, 01/09/2026).
 *
 * A hidratação é o único caminho entre a coluna e o card: sem repassar aqui, o
 * "Salvar no plano" gravaria certo no banco e a série voltaria a desenhar
 * Normal na sessão seguinte — escrita correta, efeito nenhum.
 */
describe('mapWorkoutRow — método por série', () => {
  const linhaCom = (s: Record<string, unknown>) => ({
    id: 'w9', name: 'Treino M', is_template: true, user_id: 'u1',
    exercises: [{ id: 'e9', name: 'Supino', order: 0, sets: [{ set_number: 1, reps: '10', ...s }] }],
  })
  const primeiraSerie = (row: Record<string, unknown>) => {
    const w = mapWorkoutRow(row) as unknown as { exercises: Array<{ setDetails: Array<Record<string, unknown>> }> }
    return w.exercises[0].setDetails[0]
  }

  it('leva o método salvo até o setDetails', () => {
    expect(primeiraSerie(linhaCom({ per_set_method: 'Drop-Set' })).per_set_method).toBe('Drop-Set')
  })

  it('aceita as duas grafias e devolve null quando não há escolha', () => {
    expect(primeiraSerie(linhaCom({ perSetMethod: 'Cluster' })).per_set_method).toBe('Cluster')
    expect(primeiraSerie(linhaCom({})).per_set_method).toBeNull()
  })
})
