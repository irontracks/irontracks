import { describe, it, expect } from 'vitest'
import {
    isRecord,
    resolveDate,
    formatDate,
    formatShortDate,
    formatDuration,
    formatKm,
    formatKmh,
    normalizeExerciseKey,
    calculateTotalVolume,
} from '@/utils/report/formatters'

// ─── isRecord ────────────────────────────────────────────────────────────────

describe('isRecord', () => {
    it('returns true for plain objects', () => {
        expect(isRecord({})).toBe(true)
        expect(isRecord({ a: 1 })).toBe(true)
    })
    it('returns false for null, arrays, primitives', () => {
        expect(isRecord(null)).toBe(false)
        expect(isRecord(undefined)).toBe(false)
        expect(isRecord([1, 2])).toBe(false)
        expect(isRecord('string')).toBe(false)
        expect(isRecord(42)).toBe(false)
    })
})

// ─── resolveDate ─────────────────────────────────────────────────────────────

describe('resolveDate', () => {
    it('returns null for falsy values', () => {
        expect(resolveDate(null)).toBeNull()
        expect(resolveDate(undefined)).toBeNull()
        expect(resolveDate('')).toBeNull()
        expect(resolveDate(0)).toBeNull()
    })
    it('resolves a Date instance', () => {
        const d = new Date('2025-06-15T10:00:00Z')
        expect(resolveDate(d)?.getTime()).toBe(d.getTime())
    })
    it('resolves a timestamp number', () => {
        const ms = Date.UTC(2025, 5, 15)
        const result = resolveDate(ms)
        expect(result).toBeInstanceOf(Date)
        expect(result?.getTime()).toBe(ms)
    })
    it('resolves an ISO string', () => {
        const result = resolveDate('2025-06-15T10:00:00.000Z')
        expect(result).toBeInstanceOf(Date)
        expect(result?.toISOString()).toBe('2025-06-15T10:00:00.000Z')
    })
    it('resolves a Firestore-like { toDate }', () => {
        const d = new Date('2025-06-15T10:00:00Z')
        const result = resolveDate({ toDate: () => d })
        expect(result?.getTime()).toBe(d.getTime())
    })
    it('returns null for invalid strings', () => {
        expect(resolveDate('not-a-date')).toBeNull()
    })
})

// ─── formatDate ──────────────────────────────────────────────────────────────

describe('formatDate', () => {
    it('returns empty string for invalid input', () => {
        expect(formatDate(null)).toBe('')
        expect(formatDate(undefined)).toBe('')
        expect(formatDate('garbage')).toBe('')
    })
    it('formats a valid date in pt-BR', () => {
        const result = formatDate('2025-06-15T10:30:00.000Z')
        // Should contain day/month/year and hour:minute
        expect(result).toMatch(/\d{2}\/\d{2}\/\d{2}/)
    })
})

// ─── formatShortDate ─────────────────────────────────────────────────────────

describe('formatShortDate', () => {
    it('returns empty string for invalid input', () => {
        expect(formatShortDate(null)).toBe('')
    })
    it('returns short date without time', () => {
        const result = formatShortDate('2025-06-15T10:30:00.000Z')
        expect(result).toMatch(/\d{2}\/\d{2}\/\d{2}/)
        // Should NOT contain time component
        expect(result).not.toMatch(/\d{2}:\d{2}/)
    })
})

// ─── formatDuration ──────────────────────────────────────────────────────────

describe('formatDuration', () => {
    it('returns 0:00 for falsy values', () => {
        expect(formatDuration(null)).toBe('0:00')
        expect(formatDuration(undefined)).toBe('0:00')
        expect(formatDuration(0)).toBe('0:00')
        expect(formatDuration('')).toBe('0:00')
    })
    it('formats seconds correctly', () => {
        expect(formatDuration(65)).toBe('1:05')
        expect(formatDuration(3600)).toBe('60:00')
        expect(formatDuration(90)).toBe('1:30')
        expect(formatDuration(5)).toBe('0:05')
    })
    it('handles string input', () => {
        expect(formatDuration('120')).toBe('2:00')
    })
})

// ─── formatKm ────────────────────────────────────────────────────────────────

describe('formatKm', () => {
    it('returns dash for invalid values', () => {
        expect(formatKm(null)).toBe('-')
        expect(formatKm(0)).toBe('-')
        expect(formatKm(-100)).toBe('-')
        expect(formatKm('abc')).toBe('-')
    })
    it('converts meters to km with 2 decimals', () => {
        expect(formatKm(1500)).toBe('1.50 km')
        expect(formatKm(10000)).toBe('10.00 km')
        expect(formatKm(500)).toBe('0.50 km')
    })
})

// ─── formatKmh ───────────────────────────────────────────────────────────────

describe('formatKmh', () => {
    it('returns dash for invalid values', () => {
        expect(formatKmh(null)).toBe('-')
        expect(formatKmh(0)).toBe('-')
        expect(formatKmh(-5)).toBe('-')
    })
    it('formats speed with 1 decimal', () => {
        expect(formatKmh(25.6)).toBe('25.6 km/h')
        expect(formatKmh(10)).toBe('10.0 km/h')
    })
})

// ─── normalizeExerciseKey ────────────────────────────────────────────────────

describe('normalizeExerciseKey', () => {
    it('lowercases and trims', () => {
        expect(normalizeExerciseKey('  Supino Reto  ')).toBe('supino reto')
    })
    it('collapses multiple spaces', () => {
        expect(normalizeExerciseKey('Leg   Press   45')).toBe('leg press 45')
    })
    it('handles null/undefined', () => {
        expect(normalizeExerciseKey(null)).toBe('')
        expect(normalizeExerciseKey(undefined)).toBe('')
    })
    it('handles numbers', () => {
        expect(normalizeExerciseKey(42)).toBe('42')
    })
})

// ─── calculateTotalVolume ────────────────────────────────────────────────────

describe('calculateTotalVolume', () => {
    it('returns 0 for empty/null logs', () => {
        expect(calculateTotalVolume(null)).toBe(0)
        expect(calculateTotalVolume(undefined)).toBe(0)
        expect(calculateTotalVolume({})).toBe(0)
    })
    it('sums weight * reps across all log entries', () => {
        const logs = {
            '0-0': { weight: 80, reps: 10 },
            '0-1': { weight: 80, reps: 8 },
            '1-0': { weight: 40, reps: 12 },
        }
        // 80*10 + 80*8 + 40*12 = 800 + 640 + 480 = 1920
        expect(calculateTotalVolume(logs)).toBe(1920)
    })
    it('handles comma-separated decimals (Brazilian format)', () => {
        const logs = {
            '0-0': { weight: '82,5', reps: '10' },
        }
        expect(calculateTotalVolume(logs)).toBe(825)
    })
    it('ignores entries with zero or negative weight/reps', () => {
        const logs = {
            '0-0': { weight: 0, reps: 10 },
            '0-1': { weight: 60, reps: 0 },
            '0-2': { weight: -10, reps: 5 },
            '0-3': { weight: 60, reps: 10 },
        }
        expect(calculateTotalVolume(logs)).toBe(600)
    })
    it('skips non-object entries gracefully', () => {
        const logs = {
            '0-0': 'invalid',
            '0-1': null,
            '0-2': { weight: 50, reps: 10 },
        }
        expect(calculateTotalVolume(logs)).toBe(500)
    })
})
