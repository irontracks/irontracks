import { describe, it, expect } from 'vitest'
import {
  remapPrevLogsByCanonical,
  remapPrevBaseMsByCanonical,
  applyCanonicalNamesToSession,
} from '@/utils/report/canonicalRemapping'

// ─── remapPrevLogsByCanonical ─────────────────────────────────────────────────

describe('remapPrevLogsByCanonical', () => {
  const baseMap = {
    'supino reto': 'Supino Reto com Barra',
    'supino reto com barra': 'Supino Reto com Barra',
    'leg press 45': 'Leg Press 45°',
  }

  it('remaps aliased keys to canonical keys', () => {
    const logs = { 'supino reto': [{ weight: 80 }] }
    const result = remapPrevLogsByCanonical(logs, baseMap)
    // Should NOT contain the original alias key
    expect(result).not.toHaveProperty('supino reto')
    // Should contain the canonical key (normalised)
    const keys = Object.keys(result)
    expect(keys.length).toBe(1)
    // The value should be the original logs array
    expect(Object.values(result)[0]).toEqual([{ weight: 80 }])
  })

  it('merges two aliases that resolve to the same canonical key', () => {
    const logs = {
      'supino reto': [{ weight: 80 }, null],
      'supino reto com barra': [null, { weight: 90 }],
    }
    const result = remapPrevLogsByCanonical(logs, baseMap)
    const keys = Object.keys(result)
    expect(keys.length).toBe(1)
    const merged = Object.values(result)[0] as unknown[]
    expect(merged[0]).toEqual({ weight: 80 })
    expect(merged[1]).toEqual({ weight: 90 })
  })

  it('returns empty object for null/undefined input', () => {
    expect(remapPrevLogsByCanonical(null, baseMap)).toEqual({})
    expect(remapPrevLogsByCanonical(undefined, baseMap)).toEqual({})
  })

  it('handles empty logs gracefully', () => {
    expect(remapPrevLogsByCanonical({}, baseMap)).toEqual({})
  })

  it('passes through unknown exercise names unchanged', () => {
    const logs = { 'rosca direta': [{ weight: 20 }] }
    const result = remapPrevLogsByCanonical(logs, baseMap)
    const keys = Object.keys(result)
    expect(keys.length).toBe(1)
    expect(Object.values(result)[0]).toEqual([{ weight: 20 }])
  })
})

// ─── remapPrevBaseMsByCanonical ───────────────────────────────────────────────

describe('remapPrevBaseMsByCanonical', () => {
  const baseMap = {
    'supino reto': 'Supino Reto com Barra',
    'supino reto com barra': 'Supino Reto com Barra',
  }

  it('remaps aliased keys to canonical keys', () => {
    const baseMsMap = { 'supino reto': 120000 }
    const result = remapPrevBaseMsByCanonical(baseMsMap, baseMap)
    expect(Object.keys(result).length).toBe(1)
    expect(Object.values(result)[0]).toBe(120000)
  })

  it('first-write wins when aliases collide', () => {
    const baseMsMap = {
      'supino reto': 100000,
      'supino reto com barra': 200000,
    }
    const result = remapPrevBaseMsByCanonical(baseMsMap, baseMap)
    const keys = Object.keys(result)
    expect(keys.length).toBe(1)
    // First entry should win
    expect(Object.values(result)[0]).toBe(100000)
  })

  it('handles null/undefined gracefully', () => {
    expect(remapPrevBaseMsByCanonical(null, baseMap)).toEqual({})
    expect(remapPrevBaseMsByCanonical(undefined, baseMap)).toEqual({})
  })
})

// ─── applyCanonicalNamesToSession ─────────────────────────────────────────────

describe('applyCanonicalNamesToSession', () => {
  const baseMap = {
    'supino reto': 'Supino Reto com Barra',
    'leg press 45': 'Leg Press 45°',
  }

  it('replaces exercise names with canonical equivalents', () => {
    const session = {
      id: '123',
      exercises: [
        { name: 'supino reto', sets: 3 },
        { name: 'Rosca Direta', sets: 4 },
      ],
    }
    const result = applyCanonicalNamesToSession(session, baseMap) as Record<string, unknown>
    const exercises = result.exercises as Array<{ name: string }>
    expect(exercises[0].name).toBe('Supino Reto com Barra')
    // Unknown exercise should be unchanged
    expect(exercises[1].name).toBe('Rosca Direta')
  })

  it('does not mutate the original session', () => {
    const session = {
      exercises: [{ name: 'supino reto', sets: 3 }],
    }
    const original = JSON.parse(JSON.stringify(session))
    applyCanonicalNamesToSession(session, baseMap)
    expect(session).toEqual(original)
  })

  it('returns original when session is null/undefined', () => {
    expect(applyCanonicalNamesToSession(null, baseMap)).toBeNull()
    expect(applyCanonicalNamesToSession(undefined, baseMap)).toBeUndefined()
  })

  it('returns original when exercises array is empty', () => {
    const session = { exercises: [] }
    expect(applyCanonicalNamesToSession(session, baseMap)).toEqual(session)
  })

  it('preserves non-exercises fields', () => {
    const session = {
      id: 'abc',
      exercises: [{ name: 'supino reto', sets: 3 }],
      notes: 'treino pesado',
    }
    const result = applyCanonicalNamesToSession(session, baseMap) as Record<string, unknown>
    expect(result.id).toBe('abc')
    expect(result.notes).toBe('treino pesado')
  })
})
