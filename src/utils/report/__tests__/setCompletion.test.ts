import { describe, it, expect } from 'vitest'
import { isSetCompleted } from '../setCompletion'

describe('isSetCompleted', () => {
  it('returns false for nullish or non-object inputs', () => {
    expect(isSetCompleted(null)).toBe(false)
    expect(isSetCompleted(undefined)).toBe(false)
    expect(isSetCompleted('done')).toBe(false)
    expect(isSetCompleted(42)).toBe(false)
  })

  it('returns false for empty log', () => {
    expect(isSetCompleted({})).toBe(false)
  })

  describe('primary signal: log.done', () => {
    it('counts sets with done=true', () => {
      expect(isSetCompleted({ done: true })).toBe(true)
    })

    it('counts sets with done="true" (string)', () => {
      expect(isSetCompleted({ done: 'true' })).toBe(true)
    })

    it('does not count sets with done=false', () => {
      expect(isSetCompleted({ done: false })).toBe(false)
    })
  })

  describe('unilateral sets', () => {
    it('counts unilateral set when both sides done', () => {
      expect(isSetCompleted({ L_done: true, R_done: true })).toBe(true)
    })

    it('does not count unilateral set with only one side done', () => {
      expect(isSetCompleted({ L_done: true })).toBe(false)
      expect(isSetCompleted({ R_done: true })).toBe(false)
    })

    it('counts unilateral set with L_weight > 0 even if done flags missing (legacy)', () => {
      expect(isSetCompleted({ L_weight: 30, R_weight: 30 })).toBe(true)
    })

    it('counts unilateral set with L_reps > 0 (legacy)', () => {
      expect(isSetCompleted({ L_reps: '12' })).toBe(true)
    })
  })

  describe('bilateral legacy sets (no done flag)', () => {
    it('counts sets with weight > 0', () => {
      expect(isSetCompleted({ weight: 80 })).toBe(true)
    })

    it('counts sets with reps > 0 (string)', () => {
      expect(isSetCompleted({ reps: '10' })).toBe(true)
    })

    it('accepts comma decimal (pt-BR)', () => {
      expect(isSetCompleted({ weight: '80,5' })).toBe(true)
    })

    it('rejects weight = 0 and reps = 0', () => {
      expect(isSetCompleted({ weight: 0, reps: 0 })).toBe(false)
      expect(isSetCompleted({ weight: '0', reps: '' })).toBe(false)
    })
  })

  it('counts set marked done even without numeric values', () => {
    expect(isSetCompleted({ done: true, weight: null, reps: null })).toBe(true)
  })
})
