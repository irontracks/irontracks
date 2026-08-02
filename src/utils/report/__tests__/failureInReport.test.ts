import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildReportMetrics } from '../reportMetrics'

/**
 * Guards: a série levada à FALHA precisa CHEGAR ao histórico.
 *
 * INCIDENTE: o flag `failure` era gravado no log durante o treino desde sempre,
 * mas NADA o lia depois — nem o relatório na tela, nem o PDF, nem o histórico que
 * alimenta o motor de carga. Na prática o usuário marcava a falha e ela sumia.
 *
 * Pior: `suggestWeight` JÁ tinha a trava anti-progressão pós-falha (`anyFailed`),
 * só que o dado nunca chegava lá — a trava existia no código e nunca disparava,
 * então a carga subia mesmo depois de uma série que estourou.
 */
const session = (logs: Record<string, unknown>) => ({
  exercises: [{ name: 'Supino', sets: 3 }],
  logs,
})

describe('buildReportMetrics — séries à falha', () => {
  it('conta as séries à falha e devolve os índices', () => {
    const r = buildReportMetrics(session({
      '0-0': { done: true, weight: 80, reps: 10 },
      '0-1': { done: true, weight: 80, reps: 8, failure: true },
      '0-2': { done: true, weight: 80, reps: 6, failure: true },
    }))
    const ex = r.exercises[0]
    expect(ex.setsToFailure).toBe(2)
    expect(ex.failureSetIdxs).toEqual([1, 2])
  })

  it('aceita "true" em texto (o log é serializado como JSON em workouts.notes)', () => {
    const r = buildReportMetrics(session({
      '0-0': { done: true, weight: 80, reps: 10, failure: 'true' },
    }))
    expect(r.exercises[0].setsToFailure).toBe(1)
  })

  it('sem falha, zera (não inventa marca)', () => {
    const r = buildReportMetrics(session({
      '0-0': { done: true, weight: 80, reps: 10 },
      '0-1': { done: true, weight: 80, reps: 8, failure: false },
    }))
    expect(r.exercises[0].setsToFailure).toBe(0)
    expect(r.exercises[0].failureSetIdxs).toEqual([])
  })
})

/**
 * Source-guards: as superfícies que EXIBEM a falha. São três geradores distintos
 * (relatório na tela, PDF/compartilhar e o histórico que alimenta o motor) e o
 * repo já tem histórico de corrigir um e esquecer o outro.
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('superfícies que exibem/propagam a falha', () => {
  it('PDF/compartilhar marca a série à falha', () => {
    const src = read('src/utils/report/buildHtml.ts')
    expect(src).toMatch(/failure:\s*log\.failure === true/)
    expect(src).toContain('failureHtml')
    expect(src).toMatch(/\$\{tagHtml\}\$\{failureHtml\}/)
  })

  it('relatório na tela marca a série e conta por exercício', () => {
    const src = read('src/components/workout-report/ReportExerciseCard.tsx')
    expect(src).toContain('💥 Falha')
    expect(src).toMatch(/séries à falha|série à falha/)
  })

  it('histórico propaga setFailures ao motor de carga (trava anti-progressão)', () => {
    // Sem este repasse a trava `anyFailed` do suggestWeight nunca dispara.
    expect(read('src/components/workout/hooks/useWorkoutDeload.ts')).toContain('setFailures')
    expect(read('src/components/workout/hooks/useWorkoutAutoload.ts')).toMatch(/failed:\s*f\[i\] === true/)
  })
})
