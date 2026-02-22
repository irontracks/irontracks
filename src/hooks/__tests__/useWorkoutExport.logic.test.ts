import { describe, it, expect } from 'vitest'

// Lógica pura extraída de useWorkoutExport
function buildExportFilename(title: string): string {
  return `${(title || 'treino').replace(/\s+/g, '_')}.json`
}

function serializeWorkoutForExport(workout: {
  title?: string | null
  exercises?: Array<Record<string, unknown>> | null
}): Record<string, unknown> {
  return {
    workout: {
      title: workout.title,
      exercises: (workout.exercises || []).map((ex) => ({
        name: ex.name,
        sets: ex.sets,
        reps: ex.reps,
        rpe: ex.rpe,
        cadence: ex.cadence,
        restTime: ex.restTime,
        method: ex.method,
        videoUrl: ex.videoUrl,
        notes: ex.notes,
      })),
    },
  }
}

function buildBulkExportPayload(
  user: { id: string; email: string },
  workouts: Array<Record<string, unknown>>
): Record<string, unknown> {
  return {
    user,
    workouts: workouts.map((w) => ({
      id: w.id,
      title: w.title,
      notes: w.notes,
      is_template: true,
      exercises: (Array.isArray(w.exercises) ? w.exercises as Array<Record<string, unknown>> : []).map((ex) => ({
        name: ex.name,
        sets: ex.sets,
        reps: ex.reps,
      })),
    })),
  }
}

describe('useWorkoutExport — lógica pura', () => {
  describe('buildExportFilename', () => {
    it('substitui espaços por underscores', () => {
      expect(buildExportFilename('Treino A Peito')).toBe('Treino_A_Peito.json')
    })
    it('usa "treino" quando título vazio', () => {
      expect(buildExportFilename('')).toBe('treino.json')
    })
    it('preserva título sem espaços', () => {
      expect(buildExportFilename('TreinoA')).toBe('TreinoA.json')
    })
    it('múltiplos espaços viram um único underscore', () => {
      expect(buildExportFilename('Treino  A')).toBe('Treino_A.json')
    })
  })

  describe('serializeWorkoutForExport', () => {
    it('serializa treino com exercícios', () => {
      const workout = {
        title: 'Treino A',
        exercises: [{ name: 'Supino', sets: 4, reps: '10', rpe: 8, cadence: '2020', restTime: 60, method: 'Normal', videoUrl: '', notes: '' }],
      }
      const result = serializeWorkoutForExport(workout)
      expect((result.workout as Record<string, unknown>).title).toBe('Treino A')
      const exs = ((result.workout as Record<string, unknown>).exercises) as Array<Record<string, unknown>>
      expect(exs).toHaveLength(1)
      expect(exs[0].name).toBe('Supino')
      expect(exs[0].sets).toBe(4)
    })
    it('retorna exercícios vazios quando não há exercícios', () => {
      const result = serializeWorkoutForExport({ title: 'Vazio', exercises: [] })
      const exs = ((result.workout as Record<string, unknown>).exercises) as unknown[]
      expect(exs).toHaveLength(0)
    })
    it('lida com exercises null', () => {
      const result = serializeWorkoutForExport({ title: 'Teste', exercises: null })
      const exs = ((result.workout as Record<string, unknown>).exercises) as unknown[]
      expect(exs).toHaveLength(0)
    })
  })

  describe('buildBulkExportPayload', () => {
    it('inclui dados do usuário e treinos', () => {
      const user = { id: 'u1', email: 'user@test.com' }
      const workouts = [
        { id: 'w1', title: 'Treino A', notes: '', exercises: [{ name: 'Supino', sets: 4, reps: '10' }] },
      ]
      const result = buildBulkExportPayload(user, workouts)
      expect(result.user).toEqual(user)
      expect((result.workouts as unknown[]).length).toBe(1)
      const w = (result.workouts as Array<Record<string, unknown>>)[0]
      expect(w.title).toBe('Treino A')
      expect(w.is_template).toBe(true)
    })
    it('retorna payload vazio de treinos se lista vazia', () => {
      const user = { id: 'u1', email: 'test@test.com' }
      const result = buildBulkExportPayload(user, [])
      expect((result.workouts as unknown[]).length).toBe(0)
    })
  })
})
