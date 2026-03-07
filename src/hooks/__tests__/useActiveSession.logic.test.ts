import { describe, it, expect } from 'vitest'

// Lógica pura extraída de useActiveSession
function applySessionLog(
  prevLogs: Record<string, unknown>,
  key: string,
  data: unknown
): Record<string, unknown> {
  return { ...prevLogs, [key]: data }
}

function computeTimerTarget(currentMs: number, durationSec: number): number {
  return currentMs + durationSec * 1000
}

function buildFinishedSession(
  sessionData: unknown
): { current: unknown; previous: null } {
  return { current: sessionData, previous: null }
}

describe('useActiveSession — lógica pura', () => {
  describe('applySessionLog', () => {
    it('adiciona nova entrada ao log', () => {
      const prev = { ex1: { reps: 10 } }
      const result = applySessionLog(prev, 'ex2', { reps: 12 })
      expect(result).toEqual({ ex1: { reps: 10 }, ex2: { reps: 12 } })
    })

    it('sobrescreve entrada existente', () => {
      const prev = { ex1: { reps: 10 } }
      const result = applySessionLog(prev, 'ex1', { reps: 15 })
      expect(result.ex1).toEqual({ reps: 15 })
    })

    it('não muta o objeto original', () => {
      const prev = { ex1: { reps: 10 } }
      applySessionLog(prev, 'ex2', { reps: 12 })
      expect(prev).toEqual({ ex1: { reps: 10 } })
    })

    it('funciona com log vazio', () => {
      const result = applySessionLog({}, 'ex1', { reps: 8 })
      expect(result).toEqual({ ex1: { reps: 8 } })
    })
  })

  describe('computeTimerTarget', () => {
    it('calcula alvo correto para 60s', () => {
      const now = 1000000
      expect(computeTimerTarget(now, 60)).toBe(now + 60000)
    })
    it('calcula alvo correto para 90s', () => {
      const now = 5000000
      expect(computeTimerTarget(now, 90)).toBe(now + 90000)
    })
    it('calcula alvo para 0s', () => {
      const now = 1000
      expect(computeTimerTarget(now, 0)).toBe(now)
    })
  })

  describe('buildFinishedSession', () => {
    it('cria objeto de relatório corretamente', () => {
      const data = { duration: 45, exercises: 5 }
      const result = buildFinishedSession(data)
      expect(result.current).toBe(data)
      expect(result.previous).toBeNull()
    })
    it('aceita null como data', () => {
      const result = buildFinishedSession(null)
      expect(result.current).toBeNull()
    })
  })
})
