import { describe, it, expect } from 'vitest'
import { z } from 'zod'

// ─────────────────────────────────────────────────────────────────────────────
// Schema and normalizeMessages logic extracted from coach-chat/route.ts
// ─────────────────────────────────────────────────────────────────────────────

const MessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().min(1),
})

const BodySchema = z
  .object({
    messages: z.array(MessageSchema).default([]),
    context: z.record(z.unknown()).nullable().optional(),
  })
  .strict()

type RawMessage = Record<string, unknown>

/** Mirrors normalizeMessages() from coach-chat/route.ts */
function normalizeMessages(messages: unknown): Array<{ role: string; content: string }> {
  const arr = Array.isArray(messages) ? (messages as RawMessage[]) : []
  return arr
    .map((m) => {
      const role = typeof m?.role === 'string' ? m.role.trim() : ''
      const content = typeof m?.content === 'string' ? m.content.trim() : ''
      if (!role || !content) return null
      if (!['user', 'assistant', 'system'].includes(role)) return null
      return { role, content }
    })
    .filter((x): x is { role: string; content: string } => x !== null)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('coach-chat MessageSchema', () => {
  it('accepts user, assistant, system roles', () => {
    for (const role of ['user', 'assistant', 'system'] as const) {
      expect(MessageSchema.safeParse({ role, content: 'ok' }).success).toBe(true)
    }
  })

  it('rejects invalid role', () => {
    expect(MessageSchema.safeParse({ role: 'admin', content: 'ok' }).success).toBe(false)
    expect(MessageSchema.safeParse({ role: 'tool', content: 'ok' }).success).toBe(false)
  })

  it('rejects empty content', () => {
    expect(MessageSchema.safeParse({ role: 'user', content: '' }).success).toBe(false)
  })
})

describe('coach-chat BodySchema', () => {
  it('accepts empty body (defaults applied)', () => {
    const result = BodySchema.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.messages).toEqual([])
    }
  })

  it('accepts messages array with valid entries', () => {
    const result = BodySchema.safeParse({
      messages: [{ role: 'user', content: 'Qual o melhor supino?' }],
    })
    expect(result.success).toBe(true)
  })

  it('accepts optional context record', () => {
    const result = BodySchema.safeParse({
      messages: [],
      context: { workoutName: 'Treino A', level: 'intermediário' },
    })
    expect(result.success).toBe(true)
  })

  it('accepts null context', () => {
    const result = BodySchema.safeParse({ messages: [], context: null })
    expect(result.success).toBe(true)
  })

  it('is strict — rejects unknown fields', () => {
    const result = BodySchema.safeParse({ messages: [], unknownField: 'injected' })
    expect(result.success).toBe(false)
  })
})

describe('normalizeMessages()', () => {
  it('returns valid messages', () => {
    const result = normalizeMessages([
      { role: 'user', content: 'Pergunta' },
      { role: 'assistant', content: 'Resposta' },
    ])
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ role: 'user', content: 'Pergunta' })
  })

  it('filters out messages with invalid roles', () => {
    const result = normalizeMessages([
      { role: 'user', content: 'válido' },
      { role: 'hacker', content: 'inválido' },
    ])
    expect(result).toHaveLength(1)
  })

  it('filters out messages with empty content', () => {
    const result = normalizeMessages([{ role: 'user', content: '' }])
    expect(result).toHaveLength(0)
  })

  it('trims whitespace from role and content', () => {
    const result = normalizeMessages([{ role: ' user ', content: '  Olá  ' }])
    expect(result).toHaveLength(1)
    expect(result[0].role).toBe('user')
    expect(result[0].content).toBe('Olá')
  })

  it('handles non-array input gracefully', () => {
    expect(normalizeMessages(null)).toEqual([])
    expect(normalizeMessages(undefined)).toEqual([])
    expect(normalizeMessages('not an array')).toEqual([])
    expect(normalizeMessages(42)).toEqual([])
  })
})
