import { describe, it, expect } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// Streak computation logic extracted from workouts/finish/route.ts
// ─────────────────────────────────────────────────────────────────────────────

const computeWorkoutStreak = (dateRows: unknown[]) => {
  const rows = Array.isArray(dateRows) ? dateRows : []
  const daySet = new Set<string>()
  rows.forEach((r) => {
    try {
      const row = r && typeof r === 'object' ? (r as Record<string, unknown>) : {}
      const d = row?.date ? new Date(String(row.date)) : null
      if (!d || Number.isNaN(d.getTime())) return
      const day = d.toISOString().slice(0, 10)
      daySet.add(day)
    } catch { }
  })
  if (!daySet.size) return 0

  const sorted = Array.from(daySet).sort().reverse()
  const start = sorted[0]
  let cursor = new Date(`${start}T00:00:00.000Z`)
  let streak = 0

  while (true) {
    const key = cursor.toISOString().slice(0, 10)
    if (!daySet.has(key)) break
    streak += 1
    cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000)
  }
  return streak
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('computeWorkoutStreak', () => {
  it('returns 0 for empty array', () => {
    expect(computeWorkoutStreak([])).toBe(0)
  })

  it('returns 1 for a single workout', () => {
    expect(computeWorkoutStreak([{ date: '2026-03-18' }])).toBe(1)
  })

  it('counts consecutive days', () => {
    const rows = [
      { date: '2026-03-18' },
      { date: '2026-03-17' },
      { date: '2026-03-16' },
    ]
    expect(computeWorkoutStreak(rows)).toBe(3)
  })

  it('stops at gap', () => {
    const rows = [
      { date: '2026-03-18' },
      { date: '2026-03-17' },
      // gap: 03-16 missing
      { date: '2026-03-15' },
    ]
    expect(computeWorkoutStreak(rows)).toBe(2)
  })

  it('deduplicates same-day workouts', () => {
    const rows = [
      { date: '2026-03-18T08:00:00Z' },
      { date: '2026-03-18T18:00:00Z' },
      { date: '2026-03-17T10:00:00Z' },
    ]
    expect(computeWorkoutStreak(rows)).toBe(2)
  })

  it('handles unordered input', () => {
    const rows = [
      { date: '2026-03-16' },
      { date: '2026-03-18' },
      { date: '2026-03-17' },
    ]
    expect(computeWorkoutStreak(rows)).toBe(3)
  })

  it('ignores invalid dates', () => {
    const rows = [
      { date: '2026-03-18' },
      { date: 'not-a-date' },
      { date: '2026-03-17' },
    ]
    expect(computeWorkoutStreak(rows)).toBe(2)
  })

  it('ignores null/undefined rows', () => {
    const rows = [
      { date: '2026-03-18' },
      null,
      undefined,
      { date: '2026-03-17' },
    ]
    expect(computeWorkoutStreak(rows as unknown[])).toBe(2)
  })

  it('handles rows without date field', () => {
    const rows = [
      { date: '2026-03-18' },
      { noDate: true },
      { date: '2026-03-17' },
    ]
    expect(computeWorkoutStreak(rows)).toBe(2)
  })

  it('returns 0 for non-array input', () => {
    expect(computeWorkoutStreak(null as unknown as unknown[])).toBe(0)
    expect(computeWorkoutStreak(undefined as unknown as unknown[])).toBe(0)
  })

  it('handles long streak', () => {
    const rows = Array.from({ length: 30 }, (_, i) => {
      const d = new Date('2026-03-18')
      d.setDate(d.getDate() - i)
      return { date: d.toISOString().slice(0, 10) }
    })
    expect(computeWorkoutStreak(rows)).toBe(30)
  })
})
