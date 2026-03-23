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
  })
})
