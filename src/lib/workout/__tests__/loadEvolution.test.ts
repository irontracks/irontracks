import { describe, it, expect } from 'vitest'
import { buildLoadEvolution, type LoadSessionInput } from '../loadEvolution'

// Log de série "normal": { weight, reps, done }
const set = (weight: number, reps: number, done = true, extra: Record<string, unknown> = {}) => ({ weight, reps, done, ...extra })

describe('buildLoadEvolution', () => {
  it('cruza sessões pelo NOME (índice muda) e ordena por data asc', () => {
    const sessions: LoadSessionInput[] = [
      { date: '2026-02-01', exercises: [{ name: 'Supino reto' }], logs: { '0-0': set(80, 10), '0-1': set(80, 8) } },
      // sessão mais nova, exercício em outro índice
      { date: '2026-02-08', exercises: [{ name: 'Agacho' }, { name: 'Supino Reto' }], logs: { '1-0': set(85, 10) } },
    ]
    const series = buildLoadEvolution(sessions)
    const supino = series.find((s) => /supino/i.test(s.exercise))
    expect(supino).toBeTruthy()
    expect(supino!.points).toHaveLength(2)
    expect(supino!.points[0].date < supino!.points[1].date).toBe(true)
    // carga (topWeight) subiu de 80 → 85
    expect(supino!.points[0].topWeight).toBe(80)
    expect(supino!.points[1].topWeight).toBe(85)
  })

  it('e1rm (Epley) e volume por ponto', () => {
    const sessions: LoadSessionInput[] = [
      { date: '2026-02-01', exercises: [{ name: 'Rosca' }], logs: { '0-0': set(20, 10) } },
      { date: '2026-02-02', exercises: [{ name: 'Rosca' }], logs: { '0-0': set(20, 10) } },
    ]
    const [rosca] = buildLoadEvolution(sessions)
    // volume = 20*10 = 200; e1rm = 20*(1+10/30) = 26.7
    expect(rosca.points[0].volume).toBe(200)
    expect(rosca.points[0].e1rm).toBeCloseTo(26.7, 1)
  })

  it('ignora aquecimento (não é série de trabalho)', () => {
    const sessions: LoadSessionInput[] = [
      { date: '2026-02-01', exercises: [{ name: 'Terra' }], logs: { '0-0': set(60, 10, true, { is_warmup: true }), '0-1': set(120, 5) } },
      { date: '2026-02-02', exercises: [{ name: 'Terra' }], logs: { '0-0': set(125, 5) } },
    ]
    const [terra] = buildLoadEvolution(sessions)
    // o warmup de 60kg não conta — o topWeight do 1º ponto é 120, não 60
    expect(terra.points[0].topWeight).toBe(120)
  })

  it('exercício com só 1 ponto é omitido (sem evolução)', () => {
    const sessions: LoadSessionInput[] = [
      { date: '2026-02-01', exercises: [{ name: 'Único' }], logs: { '0-0': set(50, 10) } },
    ]
    expect(buildLoadEvolution(sessions)).toEqual([])
  })

  it('exercício sem carga registrada (weight null) é ignorado', () => {
    const sessions: LoadSessionInput[] = [
      { date: '2026-02-01', exercises: [{ name: 'X' }], logs: { '0-0': { reps: 10, done: true, weight: null } } },
      { date: '2026-02-02', exercises: [{ name: 'X' }], logs: { '0-0': { reps: 10, done: true, weight: null } } },
    ]
    expect(buildLoadEvolution(sessions)).toEqual([])
  })

  it('robusto a entrada inválida', () => {
    expect(buildLoadEvolution([])).toEqual([])
    expect(buildLoadEvolution(null as unknown as LoadSessionInput[])).toEqual([])
    expect(buildLoadEvolution([{ date: '', logs: {}, exercises: [] }, null as unknown as LoadSessionInput])).toEqual([])
  })

  it('mais treinados primeiro (mais pontos)', () => {
    const sessions: LoadSessionInput[] = [
      { date: '2026-02-01', exercises: [{ name: 'A' }, { name: 'B' }], logs: { '0-0': set(50, 10), '1-0': set(30, 10) } },
      { date: '2026-02-02', exercises: [{ name: 'A' }, { name: 'B' }], logs: { '0-0': set(52, 10), '1-0': set(32, 10) } },
      { date: '2026-02-03', exercises: [{ name: 'A' }], logs: { '0-0': set(54, 10) } },
    ]
    const series = buildLoadEvolution(sessions)
    expect(series[0].exercise).toBe('A') // 3 pontos
    expect(series[0].points.length).toBeGreaterThan(series[1].points.length)
  })
})
