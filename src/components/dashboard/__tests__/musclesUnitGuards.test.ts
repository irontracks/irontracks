import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Source-guard (#2/#3): a unidade de séries deve dizer "séries", nunca "sets"
// (inglês) nem o sufixo "s" ambíguo com segundos. Trava contra reintrodução.
const root = process.cwd()
const read = (p: string) => readFileSync(resolve(root, p), 'utf8')

describe('Mapa Muscular — "séries" e não "sets" (#3)', () => {
  const src = read('src/components/dashboard/MuscleMapCard.tsx')
  it('usa "séries/semana" e "séries eq."', () => {
    expect(src).toContain('séries/semana')
    expect(src).toContain('séries eq.')
  })
  it('não reintroduz "sets" user-facing', () => {
    expect(src).not.toContain('sets/semana')
    expect(src).not.toContain('sets eq.')
    expect(src).not.toContain('} sets')
  })
})

describe('Equilíbrio Muscular — sem sufixo "s" ambíguo (#2)', () => {
  const src = read('src/components/MuscleBalanceCard.tsx')
  it('barras e chips mostram número puro (a unidade vem do cabeçalho)', () => {
    expect(src).not.toContain('{im.setsA}s')
    expect(src).not.toContain('{im.setsB}s')
    expect(src).not.toContain('{m.sets}s')
  })
})

describe('Outras superfícies de séries (#3)', () => {
  it('WeeklyMuscleSummary usa "séries", não "sets"', () => {
    const s = read('src/components/dashboard/WeeklyMuscleSummary.tsx')
    expect(s).toContain('{m.meta} séries')
    expect(s).not.toContain('{m.meta} sets')
  })
  it('MuscleTrend4wPanel usa "séries equivalentes"', () => {
    const s = read('src/components/workout-report/MuscleTrend4wPanel.tsx')
    expect(s).toContain('séries equivalentes')
    expect(s).not.toContain('sets equivalentes')
  })
})
