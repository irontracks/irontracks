import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { parseJsonWithSchema } from '@/utils/zod'

// ─────────────────────────────────────────────────────────────────────────────
// Tests for parseJsonWithSchema — the synchronous JSON+Zod parser used in
// API routes for parsing pre-extracted data (not the Request body variant).
// ─────────────────────────────────────────────────────────────────────────────

const TestSchema = z.object({
  name: z.string().min(1),
  age: z.number().int().positive(),
})

describe('parseJsonWithSchema', () => {
  it('parses valid object', () => {
    const result = parseJsonWithSchema({ name: 'Alice', age: 30 }, TestSchema)
    expect(result).toEqual({ name: 'Alice', age: 30 })
  })

  it('parses valid JSON string', () => {
    const result = parseJsonWithSchema('{"name":"Bob","age":25}', TestSchema)
    expect(result).toEqual({ name: 'Bob', age: 25 })
  })

  it('returns null for invalid object', () => {
    expect(parseJsonWithSchema({ name: '', age: -1 }, TestSchema)).toBeNull()
  })

  it('returns null for invalid JSON string', () => {
    expect(parseJsonWithSchema('not json', TestSchema)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseJsonWithSchema('', TestSchema)).toBeNull()
  })

  it('returns null for whitespace-only string', () => {
    expect(parseJsonWithSchema('   ', TestSchema)).toBeNull()
  })

  it('returns null for null/undefined', () => {
    expect(parseJsonWithSchema(null, TestSchema)).toBeNull()
    expect(parseJsonWithSchema(undefined, TestSchema)).toBeNull()
  })

  it('strips unknown fields with strict schema', () => {
    const StrictSchema = z.object({ x: z.number() }).strict()
    expect(parseJsonWithSchema({ x: 1, y: 2 }, StrictSchema)).toBeNull()
  })
})
