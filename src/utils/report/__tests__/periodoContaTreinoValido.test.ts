import { describe, it, expect } from 'vitest'
import { buildPeriodStats } from '@/utils/report/periodStats'
import type { WorkoutSummary } from '@/components/historyListTypes'

/**
 * O relatório de período e o dossiê usam o MESMO piso do card de resumo:
 * sessão de 1 série e 44 s não é treino (CLAUDE.md, "Sessão de 1 série não é
 * treino"). Sem isto o dossiê dizia 7 ao lado de um card que dizia 6.
 */
const agora = Date.now()
const sessao = (id: string, logs: Record<string, unknown>, totalTime: number): WorkoutSummary => ({
  id, date: new Date(agora - 60_000).toISOString(), dateMs: agora - 60_000, totalTime,
  rawSession: { logs, exercises: [{ name: 'Supino' }] } as never,
})

describe('buildPeriodStats conta só treino válido', () => {
  it('descarta a sessão de 44 s com uma série; mantém a de 2 séries', () => {
    const lista = [
      sessao('a', { '0-0': { done: true, weight: 40, reps: 10 }, '0-1': { done: true, weight: 40, reps: 10 } }, 1800),
      sessao('b', { '0-0': { done: true, weight: 40, reps: 10 } }, 44),
    ]
    const r = buildPeriodStats(lista, 7)
    expect(r?.stats.count).toBe(1)
  })
  it('uma série com 15+ min (cardio) continua contando', () => {
    const r = buildPeriodStats([sessao('c', { '0-0': { done: true } }, 20 * 60)], 7)
    expect(r?.stats.count).toBe(1)
  })
})
