import { describe, it, expect } from 'vitest'
import {
  parseExerciseNotesToSetOverrides,
  applyNotesMethodToSetDetails,
} from '@/utils/training/notesMethodParser'

// ────────────────────────────────────────────────────────────────────────────
// parseExerciseNotesToSetOverrides — drop-set em linguagem natural (o refactor)
// ────────────────────────────────────────────────────────────────────────────
describe('parseExerciseNotesToSetOverrides — drop-set', () => {
  it('entende descrição natural com "→" e "continua" (antes retornava null)', () => {
    const { overrides } = parseExerciseNotesToSetOverrides({
      notes: 'DROP-SET na última série: até a falha → reduz ~20% → continua sem descanso',
      setsCount: 4,
    })
    // só a última série (idx 3) é drop; as demais ficam Normal
    expect(overrides[0]).toBeNull()
    expect(overrides[1]).toBeNull()
    expect(overrides[2]).toBeNull()
    expect(overrides[3]?.kind).toBe('drop_set')
    const cfg = overrides[3]?.advanced_config as unknown[]
    expect(Array.isArray(cfg)).toBe(true)
    // "até a falha" + "continua" = 2 estágios
    expect(cfg.length).toBe(2)
  })

  it('aceita vírgula como separador quando não há "→"', () => {
    const { overrides } = parseExerciseNotesToSetOverrides({
      notes: 'Drop-set na última série: até a falha, reduz 20%, continua',
      setsCount: 3,
    })
    const cfg = overrides[2]?.advanced_config as unknown[]
    expect(Array.isArray(cfg)).toBe(true)
    expect(cfg.length).toBe(2)
  })

  it('entende sequência numérica de reps (10 > 8 > 6)', () => {
    const { overrides } = parseExerciseNotesToSetOverrides({
      notes: 'DROP na última: 10 > 8 > 6',
      setsCount: 3,
    })
    const cfg = overrides[2]?.advanced_config as Array<{ reps: string }>
    expect(cfg.length).toBe(3)
    expect(cfg.map((s) => s.reps)).toEqual(['10', '8', '6'])
  })

  it('um único estágio não vira drop (config precisa de ≥2)', () => {
    const { overrides } = parseExerciseNotesToSetOverrides({
      notes: 'DROP na última: até a falha',
      setsCount: 3,
    })
    expect(overrides[2]).toBeNull()
  })
})

// ────────────────────────────────────────────────────────────────────────────
// alvos de série
// ────────────────────────────────────────────────────────────────────────────
describe('parseExerciseNotesToSetOverrides — alvos', () => {
  it('"nas 2 últimas" marca as duas últimas séries', () => {
    const { overrides } = parseExerciseNotesToSetOverrides({
      notes: 'DROP nas 2 últimas séries: 10 > 8',
      setsCount: 4,
    })
    expect(overrides[0]).toBeNull()
    expect(overrides[1]).toBeNull()
    expect(overrides[2]?.kind).toBe('drop_set')
    expect(overrides[3]?.kind).toBe('drop_set')
  })

  it('"em todas" marca todas as séries (cluster)', () => {
    const { overrides } = parseExerciseNotesToSetOverrides({
      notes: 'Cluster em todas as séries: 5 reps > 5 reps > 5 reps, 15s',
      setsCount: 3,
    })
    expect(overrides.every((o) => o?.kind === 'cluster')).toBe(true)
    const cfg = overrides[0]?.advanced_config as { total_reps: number; cluster_size: number; intra_rest_sec: number }
    expect(cfg.total_reps).toBe(15)
    expect(cfg.cluster_size).toBe(5)
    expect(cfg.intra_rest_sec).toBe(15)
  })

  it('rest-pause na última série', () => {
    const { overrides } = parseExerciseNotesToSetOverrides({
      notes: 'Rest-pause na última série: falha > 15s > mais 3',
      setsCount: 3,
    })
    expect(overrides[2]?.kind).toBe('rest_pause')
    const cfg = overrides[2]?.advanced_config as { mini_sets: number; rest_time_sec: number }
    expect(cfg.mini_sets).toBeGreaterThanOrEqual(1)
    expect(cfg.rest_time_sec).toBe(15)
  })

  it('diretiva sem ":" é ignorada', () => {
    const { overrides } = parseExerciseNotesToSetOverrides({
      notes: 'Drop na última série sem dois pontos',
      setsCount: 3,
    })
    expect(overrides.every((o) => o === null)).toBe(true)
  })

  it('notas vazias → todos null', () => {
    const { overrides } = parseExerciseNotesToSetOverrides({ notes: '', setsCount: 3 })
    expect(overrides).toEqual([null, null, null])
  })
})

// ────────────────────────────────────────────────────────────────────────────
// applyNotesMethodToSetDetails — fusão não-destrutiva
// ────────────────────────────────────────────────────────────────────────────
describe('applyNotesMethodToSetDetails', () => {
  const mkSets = (n: number) =>
    Array.from({ length: n }).map((_, i) => ({
      set_number: i + 1,
      reps: 10,
      rpe: 8,
      weight: 80,
      is_warmup: false,
      set_type: 'working',
      advanced_config: null,
    }))

  it('preenche advanced_config na série-alvo a partir das notas', () => {
    const sets = mkSets(4)
    const out = applyNotesMethodToSetDetails(
      sets,
      'DROP-SET na última série: até a falha → reduz 20% → continua',
      4,
    )
    expect(out[0].advanced_config).toBeNull()
    expect(Array.isArray(out[3].advanced_config)).toBe(true)
  })

  it('NÃO sobrescreve advanced_config já existente (do banco/editor)', () => {
    const sets = mkSets(3)
    const existing = { mini_sets: 3, rest_time_sec: 20 }
    sets[2].advanced_config = existing as unknown as null
    const out = applyNotesMethodToSetDetails(sets, 'DROP na última: 10 > 8 > 6', 3)
    expect(out[2].advanced_config).toBe(existing)
  })

  it('preenche setDetails vazio (plano só com contagem) criando defaults', () => {
    const out = applyNotesMethodToSetDetails([], 'DROP na última: 10 > 8', 4)
    expect(out.length).toBe(4)
    expect(out[0].advanced_config).toBeNull()
    expect(Array.isArray(out[3].advanced_config)).toBe(true)
    expect(out[3].set_number).toBe(4)
  })

  it('sem diretiva aplicável → retorna o MESMO array (ref estável)', () => {
    const sets = mkSets(3)
    const out = applyNotesMethodToSetDetails(sets, 'Só uma dica de execução', 3)
    expect(out).toBe(sets)
  })

  it('notas nulas → mesmo array', () => {
    const sets = mkSets(3)
    expect(applyNotesMethodToSetDetails(sets, null, 3)).toBe(sets)
  })
})
