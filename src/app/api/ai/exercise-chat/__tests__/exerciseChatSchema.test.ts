import { describe, it, expect } from 'vitest'
import { z } from 'zod'

// ─────────────────────────────────────────────────────────────────────────────
// Schema and context-builder logic extracted from exercise-chat/route.ts
// for isolated testing without the Next.js runtime or AI SDK.
// ─────────────────────────────────────────────────────────────────────────────

const MessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(1000),
})

const BodySchema = z.object({
  exerciseName: z.string().min(1).max(120),
  setsPlanned: z.number().int().min(0).max(99).optional(),
  setsDone: z.number().int().min(0).max(99).optional(),
  repsPlanned: z.string().max(40).optional(),
  weight: z.string().max(30).optional(),
  method: z.string().max(60).optional(),
  muscleGroup: z.string().max(80).optional(),
  notes: z.string().max(400).optional(),
  messages: z.array(MessageSchema).max(20).default([]),
}).strip()

/** Mirrors the contextLines builder in route.ts */
function buildContextLines(body: z.infer<typeof BodySchema>): string {
  return [
    `Exercício: ${body.exerciseName}`,
    body.muscleGroup ? `Músculo principal: ${body.muscleGroup}` : null,
    body.method && body.method !== 'Normal' ? `Método de treino: ${body.method}` : null,
    body.setsPlanned ? `Séries planejadas: ${body.setsPlanned}` : null,
    body.setsDone !== undefined ? `Séries concluídas: ${body.setsDone}` : null,
    body.repsPlanned ? `Repetições planejadas: ${body.repsPlanned}` : null,
    body.weight ? `Peso atual: ${body.weight}` : null,
    body.notes ? `Observações do treino: "${body.notes}"` : null,
  ].filter(Boolean).join('\n')
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('exercise-chat MessageSchema', () => {
  it('accepts user role', () => {
    expect(MessageSchema.safeParse({ role: 'user', content: 'Como executo?' }).success).toBe(true)
  })

  it('accepts assistant role', () => {
    expect(MessageSchema.safeParse({ role: 'assistant', content: 'Boa execução!' }).success).toBe(true)
  })

  it('rejects invalid role', () => {
    expect(MessageSchema.safeParse({ role: 'system', content: 'hack' }).success).toBe(false)
    expect(MessageSchema.safeParse({ role: 'tool', content: 'hack' }).success).toBe(false)
  })

  it('rejects empty content', () => {
    expect(MessageSchema.safeParse({ role: 'user', content: '' }).success).toBe(false)
  })

  it('rejects content exceeding 1000 chars', () => {
    expect(MessageSchema.safeParse({ role: 'user', content: 'a'.repeat(1001) }).success).toBe(false)
  })
})

describe('exercise-chat BodySchema', () => {
  it('accepts minimum valid body (exerciseName only)', () => {
    const result = BodySchema.safeParse({ exerciseName: 'Supino Reto' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.exerciseName).toBe('Supino Reto')
      expect(result.data.messages).toEqual([]) // default applied
    }
  })

  it('accepts full valid body with all optional fields', () => {
    const result = BodySchema.safeParse({
      exerciseName: 'Agachamento',
      setsPlanned: 4,
      setsDone: 2,
      repsPlanned: '8-12',
      weight: '80kg',
      method: 'Drop Set',
      muscleGroup: 'Quadríceps',
      notes: 'Joelho dói no fundo',
      messages: [{ role: 'user', content: 'Devo continuar?' }],
    })
    expect(result.success).toBe(true)
  })

  it('rejects missing exerciseName', () => {
    expect(BodySchema.safeParse({}).success).toBe(false)
  })

  it('rejects empty exerciseName', () => {
    expect(BodySchema.safeParse({ exerciseName: '' }).success).toBe(false)
  })

  it('rejects exerciseName longer than 120 chars', () => {
    expect(BodySchema.safeParse({ exerciseName: 'a'.repeat(121) }).success).toBe(false)
  })

  it('rejects more than 20 messages', () => {
    const messages = Array.from({ length: 21 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `msg ${i}`,
    }))
    expect(BodySchema.safeParse({ exerciseName: 'Rosca', messages }).success).toBe(false)
  })

  it('accepts exactly 20 messages', () => {
    const messages = Array.from({ length: 20 }, () => ({ role: 'user', content: 'ok' }))
    expect(BodySchema.safeParse({ exerciseName: 'Rosca', messages }).success).toBe(true)
  })

  it('strips unknown fields from body', () => {
    const result = BodySchema.safeParse({ exerciseName: 'Leg Press', unknownField: 'injected' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect((result.data as Record<string, unknown>).unknownField).toBeUndefined()
    }
  })

  it('rejects negative setsPlanned', () => {
    expect(BodySchema.safeParse({ exerciseName: 'X', setsPlanned: -1 }).success).toBe(false)
  })

  it('rejects setsPlanned > 99', () => {
    expect(BodySchema.safeParse({ exerciseName: 'X', setsPlanned: 100 }).success).toBe(false)
  })
})

describe('buildContextLines()', () => {
  it('always includes exerciseName', () => {
    const body = BodySchema.parse({ exerciseName: 'Supino Reto' })
    const lines = buildContextLines(body)
    expect(lines).toContain('Exercício: Supino Reto')
  })

  it('includes muscleGroup when provided', () => {
    const body = BodySchema.parse({ exerciseName: 'Supino', muscleGroup: 'Peitoral' })
    expect(buildContextLines(body)).toContain('Músculo principal: Peitoral')
  })

  it('omits method when it is "Normal"', () => {
    const body = BodySchema.parse({ exerciseName: 'Supino', method: 'Normal' })
    expect(buildContextLines(body)).not.toContain('Método de treino')
  })

  it('includes method when it is not "Normal"', () => {
    const body = BodySchema.parse({ exerciseName: 'Supino', method: 'Drop Set' })
    expect(buildContextLines(body)).toContain('Método de treino: Drop Set')
  })

  it('includes notes with surrounding quotes', () => {
    const body = BodySchema.parse({ exerciseName: 'Leg Press', notes: 'Joelho latejando' })
    expect(buildContextLines(body)).toContain('"Joelho latejando"')
  })

  it('omits optional fields not provided', () => {
    const body = BodySchema.parse({ exerciseName: 'Rosca' })
    const lines = buildContextLines(body)
    expect(lines).not.toContain('Músculo principal')
    expect(lines).not.toContain('Séries planejadas')
    expect(lines).not.toContain('Peso atual')
  })

  it('includes setsDone: 0 (falsy but defined)', () => {
    const body = BodySchema.parse({ exerciseName: 'X', setsDone: 0 })
    expect(buildContextLines(body)).toContain('Séries concluídas: 0')
  })
})
