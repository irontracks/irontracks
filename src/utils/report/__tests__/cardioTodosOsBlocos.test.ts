import { describe, it, expect } from 'vitest'
import { getCardioSummaries, totalMinutosDeCardio } from '../cardioSummary'
import { buildReportHTML } from '../buildHtml'

/**
 * O relatório mostra TODOS os blocos do cardio, não só o primeiro.
 *
 * Relato do dono em 11/09/2026, com print: fez 5 min a 4 km/h + 10 a 5 + 15 a 6,
 * e o relatório exibia `5 min · 4 km/h` e mais nada. O dado NUNCA se perdeu —
 * conferido no banco, os três blocos estavam gravados certos; era a leitura que
 * parava no primeiro (`break` no 1º log com dado, igual no card React e no PDF).
 *
 * Com um bloco só o `break` estava correto. Virou perda de informação quando a
 * esteira ganhou BLOCOS (#1063) e ninguém revisitou quem LÊ — a mesma armadilha
 * de superfície irmã que o `docs/skill-irmaos.md` existe para evitar.
 *
 * A fixture é a sessão REAL: 300s@4 · 600s@5 · 900s@6.
 */
const BLOCOS_DO_DONO = [
  { done: true, speed: 4, incline: 0, durationSeconds: 300, per_set_method: 'Cardio' },
  { done: true, speed: 5, incline: 0, durationSeconds: 600, per_set_method: 'Cardio' },
  { done: true, speed: 6, incline: 0, durationSeconds: 900, per_set_method: 'Cardio' },
]

const ESTEIRA = {
  name: 'Esteira',
  method: 'Cardio',
  sets: 3,
  setDetails: BLOCOS_DO_DONO.map((b, i) => ({
    set_number: i + 1, reps: '', rpe: null, weight: null,
    durationSeconds: b.durationSeconds,
    advanced_config: { speed: b.speed, incline: b.incline },
  })),
}

describe('getCardioSummaries devolve todos os blocos', () => {
  it('três blocos viram três resumos, na ordem', () => {
    const blocos = getCardioSummaries(ESTEIRA, BLOCOS_DO_DONO)

    expect(blocos, 'o relatório voltou a mostrar só o primeiro bloco').toHaveLength(3)
    expect(blocos.map((b) => b.timeMin)).toEqual([5, 10, 15])
    expect(blocos.map((b) => b.speedKmh)).toEqual(['4', '5', '6'])
  })

  it('o tempo total é a soma, não o do primeiro', () => {
    const blocos = getCardioSummaries(ESTEIRA, BLOCOS_DO_DONO)
    expect(totalMinutosDeCardio(blocos), '30 min viraram 5').toBe(30)
  })

  it('bloco sem dado nenhum não vira card vazio', () => {
    const blocos = getCardioSummaries(ESTEIRA, [BLOCOS_DO_DONO[0], null, undefined, {}])
    expect(blocos).toHaveLength(1)
  })

  it('sem log, cai no planejado do exercício — não pode regredir', () => {
    const legado = { name: 'Esteira', method: 'Cardio', reps: '20', advanced_config: { speed: 7 } }
    const blocos = getCardioSummaries(legado, [])
    expect(blocos).toHaveLength(1)
    expect(blocos[0].timeMin).toBe(20)
  })
})

describe('o PDF imprime os três blocos', () => {
  const sessao = {
    workoutTitle: 'Lower B',
    date: '2026-09-11',
    exercises: [ESTEIRA],
    logs: {
      '0-0': BLOCOS_DO_DONO[0],
      '0-1': BLOCOS_DO_DONO[1],
      '0-2': BLOCOS_DO_DONO[2],
    },
  }

  it('as três velocidades aparecem no HTML exportado', () => {
    const html = buildReportHTML(sessao as never, null)

    for (const v of ['4 km/h', '5 km/h', '6 km/h']) {
      expect(html, `${v} sumiu do relatório`).toContain(v)
    }
    expect(html, 'os blocos não foram rotulados').toContain('Bloco 2')
    expect(html, 'o total de 30 min não foi dito').toContain('30 min')
  })
})
