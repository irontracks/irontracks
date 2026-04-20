import { describe, it, expect } from 'vitest'
import { SetRowSchema } from '../database'

describe('SetRowSchema — duration_seconds', () => {
  const base = {
    id: '00000000-0000-0000-0000-000000000001',
    exercise_id: '00000000-0000-0000-0000-000000000002',
    weight: 82,
    reps: null,
    rpe: null,
    set_number: 1,
    completed: true,
    is_warmup: false,
    advanced_config: null,
  }

  it('aceita duration_seconds como número positivo', () => {
    const parsed = SetRowSchema.parse({ ...base, duration_seconds: 60 })
    expect(parsed.duration_seconds).toBe(60)
  })

  it('aceita duration_seconds como null (exercícios de reps)', () => {
    const parsed = SetRowSchema.parse({ ...base, duration_seconds: null })
    expect(parsed.duration_seconds).toBeNull()
  })

  it('rejeita duration_seconds <= 0', () => {
    expect(() => SetRowSchema.parse({ ...base, duration_seconds: 0 })).toThrow()
    expect(() => SetRowSchema.parse({ ...base, duration_seconds: -5 })).toThrow()
  })

  it('rejeita duration_seconds decimal', () => {
    expect(() => SetRowSchema.parse({ ...base, duration_seconds: 1.5 })).toThrow()
  })
})
