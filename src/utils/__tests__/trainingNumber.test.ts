import { describe, it, expect } from 'vitest'
import { parseTrainingNumber, parseTrainingNumberOrZero } from '@/utils/trainingNumber'

describe('parseTrainingNumber', () => {
  it('returns number for valid integers', () => {
    expect(parseTrainingNumber(10)).toBe(10)
    expect(parseTrainingNumber(0)).toBe(0)
    expect(parseTrainingNumber(-5)).toBe(-5)
  })

  it('returns number for valid floats', () => {
    expect(parseTrainingNumber(82.5)).toBe(82.5)
  })

  it('parses numeric strings', () => {
    expect(parseTrainingNumber('100')).toBe(100)
    expect(parseTrainingNumber('3.14')).toBe(3.14)
  })

  it('parses Brazilian comma-decimal format', () => {
    expect(parseTrainingNumber('82,5')).toBe(82.5)
    expect(parseTrainingNumber('1500,75')).toBe(1500.75)
  })

  it('returns null for non-numeric strings', () => {
    expect(parseTrainingNumber('abc')).toBeNull()
    expect(parseTrainingNumber('')).toBeNull()
    expect(parseTrainingNumber('   ')).toBeNull()
  })

  it('returns null for null and undefined', () => {
    expect(parseTrainingNumber(null)).toBeNull()
    expect(parseTrainingNumber(undefined)).toBeNull()
  })

  it('returns null for Infinity and NaN', () => {
    expect(parseTrainingNumber(Infinity)).toBeNull()
    expect(parseTrainingNumber(NaN)).toBeNull()
  })
})

describe('parseTrainingNumberOrZero', () => {
  it('returns the parsed number when valid', () => {
    expect(parseTrainingNumberOrZero('75')).toBe(75)
    expect(parseTrainingNumberOrZero('82,5')).toBe(82.5)
  })

  it('returns 0 for null, undefined, or invalid input', () => {
    expect(parseTrainingNumberOrZero(null)).toBe(0)
    expect(parseTrainingNumberOrZero(undefined)).toBe(0)
    expect(parseTrainingNumberOrZero('abc')).toBe(0)
    expect(parseTrainingNumberOrZero(NaN)).toBe(0)
    expect(parseTrainingNumberOrZero(Infinity)).toBe(0)
  })

  it('returns 0 for empty string', () => {
    expect(parseTrainingNumberOrZero('')).toBe(0)
  })
})
