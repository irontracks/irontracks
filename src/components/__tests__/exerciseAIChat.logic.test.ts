import { describe, it, expect } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// Pure logic extracted from ExerciseAIChat.tsx for isolated unit testing.
// We test the business logic without mounting the full React component.
// ─────────────────────────────────────────────────────────────────────────────

// ── Constants ─────────────────────────────────────────────────────────────────

const QUICK_PROMPTS = [
  'Como executo corretamente?',
  'Estou sentindo dor. O que pode ser?',
  'Posso substituir por outro exercício?',
  'Dica para sentir mais o músculo',
]

// ── Helpers ───────────────────────────────────────────────────────────────────

let msgIdCounter = 0
function newId() { return `msg-${Date.now()}-${++msgIdCounter}` }

/** Classify API error codes into user-facing PT-BR messages (mirrors component logic) */
function classifyError(errorCode: string | undefined): string {
  if (errorCode === 'rate_limited') return 'Muitas perguntas seguidas. Aguarde um momento.'
  if (errorCode === 'limit_reached') return 'Limite de mensagens atingido. Faça upgrade para continuar.'
  return errorCode ?? 'Erro ao processar resposta'
}

/** Build the request body, omitting undefined optional fields */
function buildRequestBody(context: Record<string, unknown>, messages: Array<{ role: string; content: string }>) {
  return {
    ...context,
    messages: messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role, content: m.content })),
  }
}

/** Guard: returns false if text is empty/whitespace or loading */
function canSendMessage(text: string, loading: boolean): boolean {
  return text.trim().length > 0 && !loading
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('QUICK_PROMPTS constant', () => {
  it('has at least one prompt', () => {
    expect(QUICK_PROMPTS.length).toBeGreaterThanOrEqual(1)
  })

  it('all prompts are non-empty strings', () => {
    for (const p of QUICK_PROMPTS) {
      expect(typeof p).toBe('string')
      expect(p.trim().length).toBeGreaterThan(0)
    }
  })

  it('contains the execution and pain prompts', () => {
    expect(QUICK_PROMPTS).toContain('Como executo corretamente?')
    expect(QUICK_PROMPTS).toContain('Estou sentindo dor. O que pode ser?')
  })
})

describe('newId()', () => {
  it('generates unique IDs across multiple calls', () => {
    const ids = new Set(Array.from({ length: 100 }, newId))
    expect(ids.size).toBe(100)
  })

  it('ID starts with "msg-"', () => {
    expect(newId()).toMatch(/^msg-\d+/)
  })
})

describe('classifyError()', () => {
  it('maps rate_limited to PT-BR message', () => {
    const msg = classifyError('rate_limited')
    expect(msg).toContain('Muitas perguntas')
  })

  it('maps limit_reached to upgrade message', () => {
    const msg = classifyError('limit_reached')
    expect(msg).toContain('upgrade')
  })

  it('passes through unknown error codes as-is', () => {
    expect(classifyError('server_error')).toBe('server_error')
  })

  it('falls back to default when code is undefined', () => {
    expect(classifyError(undefined)).toBe('Erro ao processar resposta')
  })
})

describe('canSendMessage() guard', () => {
  it('returns true for valid text when not loading', () => {
    expect(canSendMessage('Olá!', false)).toBe(true)
  })

  it('returns false for empty string', () => {
    expect(canSendMessage('', false)).toBe(false)
  })

  it('returns false for whitespace-only input', () => {
    expect(canSendMessage('   ', false)).toBe(false)
  })

  it('returns false when loading is true', () => {
    expect(canSendMessage('Pergunta válida', true)).toBe(false)
  })

  it('returns false for empty input AND loading', () => {
    expect(canSendMessage('', true)).toBe(false)
  })
})

describe('buildRequestBody()', () => {
  it('includes exerciseName and messages in output', () => {
    const body = buildRequestBody(
      { exerciseName: 'Supino Reto', muscleGroup: 'Peitoral' },
      [{ role: 'user', content: 'Como executo?' }]
    )
    expect(body.exerciseName).toBe('Supino Reto')
    expect(body.muscleGroup).toBe('Peitoral')
    expect(Array.isArray(body.messages)).toBe(true)
    expect(body.messages).toHaveLength(1)
  })

  it('filters out messages with invalid roles', () => {
    const body = buildRequestBody(
      { exerciseName: 'Agachamento' },
      [
        { role: 'user', content: 'válido' },
        { role: 'system', content: 'inválido — deve ser filtrado' },
        { role: 'assistant', content: 'válido' },
      ]
    )
    expect(body.messages).toHaveLength(2)
    expect(body.messages.every(m => m.role === 'user' || m.role === 'assistant')).toBe(true)
  })

  it('handles empty messages array', () => {
    const body = buildRequestBody({ exerciseName: 'Rosca' }, [])
    expect(body.messages).toHaveLength(0)
  })

  it('does not include undefined optional fields that were not passed', () => {
    const body = buildRequestBody({ exerciseName: 'Leg Press' }, [])
    // Only the keys from context are included; notes not passed → shouldn't appear
    expect(body).not.toHaveProperty('notes')
  })
})
