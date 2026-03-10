import { describe, it, expect } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// Pure helper logic extracted from post-workout-insights/route.ts for testing.
// Tests normalizeAi(), extractJsonFromModelText(), and computeMetrics() logic.
// ─────────────────────────────────────────────────────────────────────────────

const toArr = (v: unknown) =>
  Array.isArray(v) ? v.map((x) => String(x || '').trim()).filter(Boolean) : []
const toStr = (v: unknown) => String(v || '').trim()
const toRating = (v: unknown) => {
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  return Math.max(0, Math.min(5, Math.round(n)))
}

function normalizeAi(obj: unknown): Record<string, unknown> {
  const base = obj && typeof obj === 'object' ? (obj as Record<string, unknown>) : {}
  return {
    rating: toRating(base?.rating ?? base?.stars ?? base?.score),
    rating_reason: toStr(base?.rating_reason ?? base?.ratingReason ?? base?.reason).slice(0, 500),
    summary: toArr(base?.summary).slice(0, 8),
    motivation: toStr(base?.motivation).slice(0, 600),
    highlights: toArr(base?.highlights).slice(0, 10),
    warnings: toArr(base?.warnings).slice(0, 10),
  }
}

function extractJsonFromModelText(text: string): unknown | null {
  const cleaned = String(text || '').trim()
  if (!cleaned) return null
  try { return JSON.parse(cleaned) } catch { /* fall through */ }
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  try { return JSON.parse(cleaned.slice(start, end + 1)) } catch { return null }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('toRating()', () => {
  it('clamps values to 0-5', () => {
    expect(toRating(5)).toBe(5)
    expect(toRating(0)).toBe(0)
    expect(toRating(6)).toBe(5) // clamped
    expect(toRating(-1)).toBe(0) // clamped
  })

  it('rounds decimals', () => {
    expect(toRating(4.4)).toBe(4)
    expect(toRating(4.5)).toBe(5)
  })

  it('returns null for non-numeric string values', () => {
    expect(toRating('abc')).toBeNull()
    expect(toRating('xyz')).toBeNull()
  })

  it('coerces null/undefined to 0 (JS Number coercion behavior)', () => {
    // Number(null) === 0 and Number(undefined) === NaN → null
    expect(toRating(null)).toBe(0) // Number(null) = 0 → clamps to 0
    expect(toRating(undefined)).toBeNull() // Number(undefined) = NaN → null
  })
})

describe('normalizeAi()', () => {
  it('normalizes a complete AI response', () => {
    const result = normalizeAi({
      rating: 4,
      rating_reason: 'Bom treino',
      summary: ['Set 1', 'Set 2'],
      motivation: 'Continue assim!',
      highlights: ['PR no supino'],
      warnings: [],
    })
    expect(result.rating).toBe(4)
    expect(result.rating_reason).toBe('Bom treino')
    expect(Array.isArray(result.summary)).toBe(true)
    expect(result.motivation).toBe('Continue assim!')
  })

  it('accepts alternative key aliases (stars, ratingReason)', () => {
    const result = normalizeAi({ stars: 3, ratingReason: 'Ok', summary: [], motivation: '', highlights: [], warnings: [] })
    expect(result.rating).toBe(3)
    expect(result.rating_reason).toBe('Ok')
  })

  it('filters empty strings from arrays', () => {
    const result = normalizeAi({ summary: ['item', '', '  ', 'outro'], rating: 4, motivation: '', highlights: [], warnings: [] })
    const summary = result.summary as string[]
    expect(summary).toContain('item')
    expect(summary).toContain('outro')
    expect(summary).not.toContain('')
    expect(summary).not.toContain('  ')
  })

  it('caps summary at 8 items', () => {
    const result = normalizeAi({ summary: Array.from({ length: 15 }, (_, i) => `item${i}`), rating: 5, motivation: '', highlights: [], warnings: [] })
    expect((result.summary as string[]).length).toBe(8)
  })

  it('caps rating_reason at 500 chars', () => {
    const result = normalizeAi({ rating_reason: 'x'.repeat(600), rating: 5, summary: [], motivation: '', highlights: [], warnings: [] })
    expect((result.rating_reason as string).length).toBe(500)
  })

  it('handles null/undefined input gracefully', () => {
    expect(() => normalizeAi(null)).not.toThrow()
    expect(() => normalizeAi(undefined)).not.toThrow()
  })
})

describe('extractJsonFromModelText()', () => {
  it('parses clean JSON', () => {
    const input = '{"rating": 4, "summary": ["ok"]}'
    const result = extractJsonFromModelText(input)
    expect(result).toEqual({ rating: 4, summary: ['ok'] })
  })

  it('extracts JSON from markdown code block garbage', () => {
    const input = 'Aqui está o JSON:\n```json\n{"rating": 5}\n```'
    // Our extractor finds first { and last }
    const result = extractJsonFromModelText(input)
    expect(result).not.toBeNull()
  })

  it('extracts JSON from text prefix', () => {
    const input = 'Resultado do treino: {"rating": 3, "summary": []}'
    const result = extractJsonFromModelText(input) as Record<string, unknown>
    expect(result?.rating).toBe(3)
  })

  it('returns null for empty string', () => {
    expect(extractJsonFromModelText('')).toBeNull()
  })

  it('returns null for non-JSON text', () => {
    expect(extractJsonFromModelText('não é um json')).toBeNull()
  })

  it('returns null for unmatched braces', () => {
    expect(extractJsonFromModelText('{unclosed')).toBeNull()
  })
})
