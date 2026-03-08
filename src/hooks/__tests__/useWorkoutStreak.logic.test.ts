import { describe, it, expect } from 'vitest'

// Lógica pura extraída de useWorkoutStreak
function parseStreakData(data: Record<string, unknown>): {
  currentStreak: number
  bestStreak: number
  totalWorkouts: number
  totalVolumeKg: number
} {
  return {
    currentStreak: Number(data.currentStreak ?? data.current_streak ?? 0) || 0,
    bestStreak: Number(data.bestStreak ?? data.best_streak ?? data.longestStreak ?? data.longest_streak ?? 0) || 0,
    totalWorkouts: Number(data.totalWorkouts ?? data.total_workouts ?? 0) || 0,
    totalVolumeKg: Number(data.totalVolumeKg ?? data.total_volume_kg ?? 0) || 0,
  }
}

function parseBadges(rawBadges: unknown[]): Array<{ id: string; label: string; kind: string }> {
  return rawBadges
    .filter((b): b is Record<string, unknown> => b !== null && typeof b === 'object' && !Array.isArray(b))
    .map((b) => ({
      id: String(b.id ?? ''),
      label: String(b.label ?? ''),
      kind: String(b.kind ?? ''),
    }))
    .filter((b) => !!b.id)
}

describe('useWorkoutStreak — lógica pura', () => {
  describe('parseStreakData', () => {
    it('parseia campos camelCase', () => {
      const data = { currentStreak: 5, bestStreak: 10, totalWorkouts: 50, totalVolumeKg: 12000 }
      expect(parseStreakData(data)).toEqual({ currentStreak: 5, bestStreak: 10, totalWorkouts: 50, totalVolumeKg: 12000 })
    })
    it('parseia campos snake_case', () => {
      const data = { current_streak: 3, best_streak: 7, total_workouts: 20, total_volume_kg: 5000 }
      expect(parseStreakData(data)).toEqual({ currentStreak: 3, bestStreak: 7, totalWorkouts: 20, totalVolumeKg: 5000 })
    })
    it('usa 0 para campos ausentes', () => {
      expect(parseStreakData({})).toEqual({ currentStreak: 0, bestStreak: 0, totalWorkouts: 0, totalVolumeKg: 0 })
    })
    it('aceita longest_streak como bestStreak', () => {
      const data = { longest_streak: 15 }
      expect(parseStreakData(data).bestStreak).toBe(15)
    })
    it('converte string numérica', () => {
      const data = { currentStreak: '8', bestStreak: '20' }
      expect(parseStreakData(data).currentStreak).toBe(8)
    })
  })

  describe('parseBadges', () => {
    it('parseia badges válidos', () => {
      const raw = [{ id: 'b1', label: 'Iniciante', kind: 'streak' }]
      const result = parseBadges(raw)
      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({ id: 'b1', label: 'Iniciante', kind: 'streak' })
    })
    it('filtra badges sem id', () => {
      const raw = [{ label: 'Sem ID', kind: 'streak' }]
      expect(parseBadges(raw)).toHaveLength(0)
    })
    it('retorna lista vazia para array vazio', () => {
      expect(parseBadges([])).toHaveLength(0)
    })
    it('filtra valores não-objeto', () => {
      const raw = [null, 'string', 42, { id: 'valid', label: 'Ok', kind: 'test' }]
      const result = parseBadges(raw)
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('valid')
    })
  })
})
