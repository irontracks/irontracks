/**
 * Relatório × exercício unilateral.
 *
 * Print do dono (jul/2026, "Detalhe por exercício"):
 *  - EXECUÇÃO vinha "—" nos dois exercícios unilaterais e preenchida nos
 *    bilaterais. Causa: `normalSet` gravava `executionSeconds: 0` FIXO ao
 *    concluir os dois lados (guard no fim deste arquivo).
 *  - REPS mostrava 36 num exercício de 3×(12+12) = 72, porque a contagem pegava
 *    um lado só — enquanto a coluna VOLUME, na mesma linha, somava os dois.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { setTotalReps, setTopWeightReps, setVolume } from '../setVolume'
import { buildReportMetrics } from '../reportMetrics'

describe('setTotalReps', () => {
  it('unilateral soma os dois lados', () => {
    expect(setTotalReps({ L_reps: '12', R_reps: '12' })).toBe(24)
    expect(setTotalReps({ L_reps: '12', R_reps: '10' })).toBe(22)
  })

  it('um lado só registrado conta esse lado', () => {
    expect(setTotalReps({ L_reps: '12' })).toBe(12)
  })

  it('série normal continua sendo o próprio reps', () => {
    expect(setTotalReps({ weight: '100', reps: '10' })).toBe(10)
    expect(setTotalReps(null)).toBe(0)
  })

  it('exibição da série (setTopWeightReps) continua por lado — é o par do peso do lado', () => {
    expect(setTopWeightReps({ L_weight: '40', L_reps: '12', R_weight: '40', R_reps: '12' })).toEqual({ weight: 40, reps: 12 })
  })
})

describe('Detalhe por exercício — unilateral', () => {
  const session = {
    workoutTitle: 'Lower A',
    exercises: [{ name: 'Cadeira flexora unilateral', sets: 3, restTime: 60 }],
    logs: {
      '0-0': { L_weight: '40', L_reps: '12', R_weight: '40', R_reps: '12', done: true, executionSeconds: 45 },
      '0-1': { L_weight: '40', L_reps: '12', R_weight: '40', R_reps: '12', done: true, executionSeconds: 45 },
      '0-2': { L_weight: '40', L_reps: '12', R_weight: '40', R_reps: '12', done: true, executionSeconds: 45 },
    },
  }

  it('reps contam os dois lados e batem com o volume da mesma linha', () => {
    const metrics = buildReportMetrics(session as never, null, {} as never)
    const row = metrics.exercises[0] as Record<string, unknown>
    expect(row.repsDone).toBe(72)
    // 40 kg × 12 × 2 lados × 3 séries = 2880 kg — volume e reps na mesma régua.
    expect(row.volumeKg).toBe(2880)
    expect(Number(row.volumeKg)).toBe(Number(row.repsDone) * 40)
  })

  it('execução aparece quando o log tem o tempo gravado', () => {
    const metrics = buildReportMetrics(session as never, null, {} as never)
    const row = metrics.exercises[0] as Record<string, unknown>
    expect(row.executionMinutes).toBeCloseTo(2.3, 1) // 135s
  })

  it('setVolume (base do volume/calorias) segue somando os dois lados', () => {
    expect(setVolume({ L_weight: '40', L_reps: '12', R_weight: '40', R_reps: '12' })).toBe(960)
  })
})

describe('Guard: unilateral não pode gravar executionSeconds fixo em 0', () => {
  it('normalSet calcula o tempo da série nos dois lados', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/workout/set-renderers/normalSet.tsx'), 'utf8')
    expect(
      /executionSeconds:\s*0\b/.test(src),
      'zero fixo faz a coluna EXECUÇÃO do relatório sair vazia em todo unilateral',
    ).toBe(false)
    expect(src).toContain('execSecondsFrom')
  })
})
