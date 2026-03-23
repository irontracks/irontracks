import { describe, it, expect } from 'vitest'
import { safeRecord, safeArray, safeString } from '@/utils/guards'

// ────────────────────────────────────────────────────────────────────────────
// safeRecord
// ────────────────────────────────────────────────────────────────────────────
describe('safeRecord', () => {
  it('returns object as-is', () => {
    const obj = { a: 1 }
    expect(safeRecord(obj)).toBe(obj)
  })

  it('returns {} for null', () => {
    expect(safeRecord(null)).toEqual({})
  })

  it('returns {} for undefined', () => {
    expect(safeRecord(undefined)).toEqual({})
  })

  it('returns {} for array (arrays are not records)', () => {
    expect(safeRecord([1, 2])).toEqual({})
  })

  it('returns {} for string', () => {
    expect(safeRecord('hello')).toEqual({})
  })

  it('returns {} for number', () => {
    expect(safeRecord(42)).toEqual({})
  })

  it('returns {} for boolean', () => {
    expect(safeRecord(true)).toEqual({})
  })

  it('returns {} for 0 (falsy)', () => {
    expect(safeRecord(0)).toEqual({})
  })
})

// ────────────────────────────────────────────────────────────────────────────
// safeArray
// ────────────────────────────────────────────────────────────────────────────
describe('safeArray', () => {
  it('returns array as-is', () => {
    const arr = [1, 2, 3]
    expect(safeArray(arr)).toBe(arr)
  })

  it('returns [] for null', () => {
    expect(safeArray(null)).toEqual([])
  })

  it('returns [] for undefined', () => {
    expect(safeArray(undefined)).toEqual([])
  })

  it('returns [] for string', () => {
    expect(safeArray('hello')).toEqual([])
  })

  it('returns [] for object', () => {
    expect(safeArray({ a: 1 })).toEqual([])
  })

  it('returns [] for number', () => {
    expect(safeArray(42)).toEqual([])
  })

  it('preserves empty array', () => {
    expect(safeArray([])).toEqual([])
  })
})

// ────────────────────────────────────────────────────────────────────────────
// safeString
// ────────────────────────────────────────────────────────────────────────────
describe('safeString', () => {
  it('returns trimmed string', () => {
    expect(safeString('  hello  ')).toBe('hello')
  })

  it('returns "" for null', () => {
    expect(safeString(null)).toBe('')
  })

  it('returns "" for undefined', () => {
    expect(safeString(undefined)).toBe('')
  })

  it('converts number to string', () => {
    expect(safeString(42)).toBe('42')
  })

  it('converts boolean to string', () => {
    expect(safeString(true)).toBe('true')
  })

  it('converts 0 to "0"', () => {
    expect(safeString(0)).toBe('0')
  })

  it('trims whitespace-only to ""', () => {
    expect(safeString('   ')).toBe('')
  })
})
