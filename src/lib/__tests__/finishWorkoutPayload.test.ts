import { describe, it, expect } from 'vitest'
import { buildFinishWorkoutPayload } from '@/lib/finishWorkoutPayload'

// ────────────────────────────────────────────────────────────────────────────
// buildFinishWorkoutPayload — testes unitários
// Nota: importamos diretamente → apenas deps de Node.js (sem Next.js/browser)
// ────────────────────────────────────────────────────────────────────────────

const MOCK_WORKOUT = {
  id: 'workout-123',
  title: 'Treino A — Peito e Tríceps',
  exercises: [
    { name: 'Supino Reto', sets: 3, reps: 10, rpe: 8, cadence: '2011', restTime: 60 },
    { name: 'Tríceps Testa', sets: 4, reps: 12, rpe: null, cadence: null, restTime: 90 },
    { name: '', sets: 1, reps: 8 }, // sem nome — deve ser filtrado
  ],
}

describe('buildFinishWorkoutPayload', () => {
  describe('campos de topo', () => {
    it('usa o título do workout', () => {
      const result = buildFinishWorkoutPayload({
        workout: MOCK_WORKOUT,
        elapsedSeconds: 3600,
        logs: {},
        ui: {},
        postCheckin: null,
      })
      expect(result.workoutTitle).toBe('Treino A — Peito e Tríceps')
    })

    it('usa "Treino" como título padrão quando workout sem título', () => {
      const result = buildFinishWorkoutPayload({
        workout: { exercises: [] },
        elapsedSeconds: 0,
        logs: {},
        ui: {},
        postCheckin: null,
      })
      expect(result.workoutTitle).toBe('Treino')
    })

    it('propaga elapsedSeconds para totalTime e realTotalTime', () => {
      const result = buildFinishWorkoutPayload({
        workout: MOCK_WORKOUT,
        elapsedSeconds: 2700,
        logs: {},
        ui: {},
        postCheckin: null,
      })
      expect(result.totalTime).toBe(2700)
      expect(result.realTotalTime).toBe(2700)
    })

    it('inclui date como string ISO', () => {
      const result = buildFinishWorkoutPayload({
        workout: MOCK_WORKOUT,
        elapsedSeconds: 0,
        logs: {},
        ui: {},
        postCheckin: null,
      })
      expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    })

    it('inclui o originWorkoutId', () => {
      const result = buildFinishWorkoutPayload({
        workout: MOCK_WORKOUT,
        elapsedSeconds: 0,
        logs: {},
        ui: {},
        postCheckin: null,
      })
      expect(result.originWorkoutId).toBe('workout-123')
    })
  })

  describe('exercícios', () => {
    it('filtra exercícios sem nome', () => {
      const result = buildFinishWorkoutPayload({
        workout: MOCK_WORKOUT,
        elapsedSeconds: 0,
        logs: {},
        ui: {},
        postCheckin: null,
      })
      expect(result.exercises).toHaveLength(2)
      expect(result.exercises.every((e) => e.name.length > 0)).toBe(true)
    })

    it('mapeia corretamente os campos dos exercícios', () => {
      const result = buildFinishWorkoutPayload({
        workout: MOCK_WORKOUT,
        elapsedSeconds: 0,
        logs: {},
        ui: {},
        postCheckin: null,
      })
      const primeiro = result.exercises[0]
      expect(primeiro.name).toBe('Supino Reto')
      expect(primeiro.sets).toBe(3)
      expect(primeiro.reps).toBe(10)
      expect(primeiro.rpe).toBe(8)
      expect(primeiro.restTime).toBe(60)
    })

    it('retorna array vazio quando workout não tem exercícios', () => {
      const result = buildFinishWorkoutPayload({
        workout: { id: 'w1', title: 'Vazio', exercises: [] },
        elapsedSeconds: 0,
        logs: {},
        ui: {},
        postCheckin: null,
      })
      expect(result.exercises).toHaveLength(0)
    })

    it('suporta setDetails via snake_case (set_details)', () => {
      const result = buildFinishWorkoutPayload({
        workout: {
          exercises: [
            { name: 'Agachamento', sets: 3, reps: 8, set_details: [{ reps: 8, weight: 60 }] },
          ],
        },
        elapsedSeconds: 0,
        logs: {},
        ui: {},
        postCheckin: null,
      })
      expect(result.exercises[0].setDetails).toHaveLength(1)
    })
  })

  describe('cálculo de tempo a partir dos logs', () => {
    it('soma executionTotalSeconds dos logs', () => {
      const logs = {
        ex1: { executionSeconds: 120, restSeconds: 60 },
        ex2: { executionSeconds: 90, restSeconds: 45 },
      }
      const result = buildFinishWorkoutPayload({
        workout: MOCK_WORKOUT,
        elapsedSeconds: 300,
        logs,
        ui: {},
        postCheckin: null,
      })
      expect(result.executionTotalSeconds).toBe(210) // 120+90
      expect(result.restTotalSeconds).toBe(105) // 60+45
    })

    it('suporta campos snake_case nos logs (execution_seconds)', () => {
      const logs = {
        ex1: { execution_seconds: 60, rest_seconds: 30 },
      }
      const result = buildFinishWorkoutPayload({
        workout: MOCK_WORKOUT,
        elapsedSeconds: 100,
        logs,
        ui: {},
        postCheckin: null,
      })
      expect(result.executionTotalSeconds).toBe(60)
      expect(result.restTotalSeconds).toBe(30)
    })

    it('ignora valores não-numéricos nos logs', () => {
      const logs = { ex1: { executionSeconds: 'abc', restSeconds: null } }
      const result = buildFinishWorkoutPayload({
        workout: MOCK_WORKOUT,
        elapsedSeconds: 0,
        logs,
        ui: {},
        postCheckin: null,
      })
      expect(result.executionTotalSeconds).toBe(0)
      expect(result.restTotalSeconds).toBe(0)
    })
  })

  describe('checkins', () => {
    it('inclui postCheckin quando fornecido', () => {
      const checkin = { mood: 5, energy: 4 }
      const result = buildFinishWorkoutPayload({
        workout: MOCK_WORKOUT,
        elapsedSeconds: 0,
        logs: {},
        ui: {},
        postCheckin: checkin,
      })
      expect(result.postCheckin).toEqual(checkin)
    })

    it('inclui preCheckin do ui quando fornecido', () => {
      const result = buildFinishWorkoutPayload({
        workout: MOCK_WORKOUT,
        elapsedSeconds: 0,
        logs: {},
        ui: { preCheckin: { soreness: 3 } },
        postCheckin: null,
      })
      expect(result.preCheckin).toEqual({ soreness: 3 })
    })

    it('postCheckin é null quando não fornecido', () => {
      const result = buildFinishWorkoutPayload({
        workout: MOCK_WORKOUT,
        elapsedSeconds: 0,
        logs: {},
        ui: {},
        postCheckin: null,
      })
      expect(result.postCheckin).toBeNull()
    })
  })

  describe('robustez com entradas inválidas', () => {
    it('trata workout=null graciosamente', () => {
      const result = buildFinishWorkoutPayload({
        // @ts-expect-error - teste proposital com null
        workout: null,
        elapsedSeconds: 0,
        logs: {},
        ui: {},
        postCheckin: null,
      })
      expect(result.workoutTitle).toBe('Treino')
      expect(result.exercises).toHaveLength(0)
    })

    it('trata logs=null graciosamente', () => {
      const result = buildFinishWorkoutPayload({
        workout: MOCK_WORKOUT,
        elapsedSeconds: 0,
        // @ts-expect-error - teste proposital com null
        logs: null,
        ui: {},
        postCheckin: null,
      })
      expect(result.executionTotalSeconds).toBe(0)
    })
  })
})
