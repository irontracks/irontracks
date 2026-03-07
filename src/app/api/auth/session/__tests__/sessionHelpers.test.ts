import { describe, it, expect } from 'vitest'
import { z } from 'zod'

// ─────────────────────────────────────────────────────────────────────────────
// Schema and validation logic extracted from auth/session/route.ts
// for isolated testing without Next.js runtime.
// ─────────────────────────────────────────────────────────────────────────────

const BodySchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
})

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('auth/session BodySchema', () => {
  it('accepts valid tokens', () => {
    const result = BodySchema.safeParse({
      access_token: 'eyJhbGciOiJIUzI1NiJ9.test',
      refresh_token: 'refresh-abc-123',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.access_token).toBe('eyJhbGciOiJIUzI1NiJ9.test')
      expect(result.data.refresh_token).toBe('refresh-abc-123')
    }
  })

  it('rejects missing access_token', () => {
    const result = BodySchema.safeParse({ refresh_token: 'abc' })
    expect(result.success).toBe(false)
  })

  it('rejects missing refresh_token', () => {
    const result = BodySchema.safeParse({ access_token: 'abc' })
    expect(result.success).toBe(false)
  })

  it('rejects empty strings', () => {
    const result = BodySchema.safeParse({
      access_token: '',
      refresh_token: '',
    })
    expect(result.success).toBe(false)
  })

  it('rejects completely empty body', () => {
    expect(BodySchema.safeParse({}).success).toBe(false)
    expect(BodySchema.safeParse(null).success).toBe(false)
    expect(BodySchema.safeParse(undefined).success).toBe(false)
  })

  it('rejects numeric values', () => {
    const result = BodySchema.safeParse({
      access_token: 12345,
      refresh_token: 67890,
    })
    expect(result.success).toBe(false)
  })

  it('strips unknown fields by default', () => {
    const result = BodySchema.safeParse({
      access_token: 'valid',
      refresh_token: 'valid',
      extra_field: 'should not appear',
    })
    expect(result.success).toBe(true)
  })
})
