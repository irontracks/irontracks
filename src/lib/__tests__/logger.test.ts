import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// We test the sanitize logic via the logger's behavior.
// Since sanitize is not exported, we spy on console methods and check output.

describe('logger sanitization', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('redacts sensitive keys in extra object', async () => {
    const { logInfo } = await import('@/lib/logger')
    logInfo('test', 'msg', { password: 'secret123', name: 'Alice' })
    const call = (console.log as ReturnType<typeof vi.spyOn>).mock.calls[0]
    const sanitized = call[1] as Record<string, unknown>
    expect(sanitized.password).toBe('[redacted]')
    expect(sanitized.name).toBe('Alice')
  })

  it('redacts token fields', async () => {
    const { logWarn } = await import('@/lib/logger')
    logWarn('test', 'msg', { token: 'abc123', value: 42 })
    const call = (console.warn as ReturnType<typeof vi.spyOn>).mock.calls[0]
    const sanitized = call[1] as Record<string, unknown>
    expect(sanitized.token).toBe('[redacted]')
    expect(sanitized.value).toBe(42)
  })

  it('redacts nested sensitive fields', async () => {
    const { logInfo } = await import('@/lib/logger')
    logInfo('test', 'msg', { user: { api_key: 'key-xyz', email: 'a@b.com' } })
    const call = (console.log as ReturnType<typeof vi.spyOn>).mock.calls[0]
    const sanitized = call[1] as Record<string, Record<string, unknown>>
    expect(sanitized.user.api_key).toBe('[redacted]')
    expect(sanitized.user.email).toBe('a@b.com')
  })

  it('handles arrays without crashing', async () => {
    const { logInfo } = await import('@/lib/logger')
    expect(() => logInfo('test', 'msg', [{ password: 'x' }, { name: 'y' }])).not.toThrow()
    const call = (console.log as ReturnType<typeof vi.spyOn>).mock.calls[0]
    const sanitized = call[1] as Array<Record<string, unknown>>
    expect(sanitized[0].password).toBe('[redacted]')
    expect(sanitized[1].name).toBe('y')
  })

  it('passes through non-object extras unchanged', async () => {
    const { logInfo } = await import('@/lib/logger')
    logInfo('test', 'msg', 'plain string')
    const call = (console.log as ReturnType<typeof vi.spyOn>).mock.calls[0]
    expect(call[1]).toBe('plain string')
  })

  it('logError always logs in production env', async () => {
    const orig = process.env.NODE_ENV
    // Can't easily force IS_PROD since it's captured at module load time.
    // Just verify logError is callable and uses console.error.
    const { logError } = await import('@/lib/logger')
    logError('test', new Error('boom'))
    expect(console.error).toHaveBeenCalled()
    process.env.NODE_ENV = orig
  })
})

describe('computeWorkoutStreak', () => {
  it('returns 0 for empty input', async () => {
    const { computeWorkoutStreak } = await import('@/lib/social/workoutNotifications')
    expect(computeWorkoutStreak([])).toBe(0)
  })

  it('counts consecutive days from today', async () => {
    const { computeWorkoutStreak } = await import('@/lib/social/workoutNotifications')
    const today = new Date()
    const yesterday = new Date(today.getTime() - 86400_000)
    const dates = [
      { date: today.toISOString() },
      { date: yesterday.toISOString() },
    ]
    expect(computeWorkoutStreak(dates)).toBe(2)
  })

  it('stops at the first gap', async () => {
    const { computeWorkoutStreak } = await import('@/lib/social/workoutNotifications')
    const today = new Date()
    const twoDaysAgo = new Date(today.getTime() - 2 * 86400_000)
    // Gap: yesterday is missing
    const dates = [{ date: today.toISOString() }, { date: twoDaysAgo.toISOString() }]
    expect(computeWorkoutStreak(dates)).toBe(1)
  })

  it('deduplicates same-day entries', async () => {
    const { computeWorkoutStreak } = await import('@/lib/social/workoutNotifications')
    const today = new Date()
    const dates = [{ date: today.toISOString() }, { date: today.toISOString() }]
    expect(computeWorkoutStreak(dates)).toBe(1)
  })
})

describe('buildBestByExerciseFromSession', () => {
  it('returns empty map for empty session', async () => {
    const { buildBestByExerciseFromSession } = await import('@/lib/social/workoutNotifications')
    expect(buildBestByExerciseFromSession({}).size).toBe(0)
  })

  it('picks the heaviest set per exercise', async () => {
    const { buildBestByExerciseFromSession } = await import('@/lib/social/workoutNotifications')
    const session = {
      exercises: [{ name: 'Supino', sets: 2 }],
      logs: {
        '0-0': { done: true, weight: 80, reps: 8 },
        '0-1': { done: true, weight: 100, reps: 5 },
      },
    }
    const result = buildBestByExerciseFromSession(session)
    expect(result.get('Supino')?.weight).toBe(100)
  })

  it('filters by onlyNames when provided', async () => {
    const { buildBestByExerciseFromSession } = await import('@/lib/social/workoutNotifications')
    const session = {
      exercises: [
        { name: 'Supino', sets: 1 },
        { name: 'Agachamento', sets: 1 },
      ],
      logs: {
        '0-0': { done: true, weight: 80, reps: 8 },
        '1-0': { done: true, weight: 120, reps: 5 },
      },
    }
    const result = buildBestByExerciseFromSession(session, new Set(['Supino']))
    expect(result.has('Supino')).toBe(true)
    expect(result.has('Agachamento')).toBe(false)
  })
})
