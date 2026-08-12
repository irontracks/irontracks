/**
 * Guard do número feio no placeholder de série.
 *
 * Sintoma (print do dono, 12/08/2026): o modal "Preencher etapas" do Drop-Set
 * mostrava `19.33333333333333` no campo de reps das duas etapas. A origem é
 * `avgReps` — uma MÉDIA do último treino (58 reps ÷ 3 séries) — impressa crua.
 *
 * O mesmo objeto (`deloadSuggestions`) alimenta a série normal e o rest-pause,
 * e `buildDeloadPatches` GRAVA `String(suggestion.reps)` no log quando o deload
 * é aplicado numa série sem reps. Por isso o arredondamento fica na FONTE, e
 * este arquivo cobre a função pura E a fiação dos dois caminhos que a produzem.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { roundSuggestion, buildDeloadPatches } from '../deloadHelpers'

describe('roundSuggestion', () => {
  it('reps vira contagem inteira — era o 19.33333333333333 da tela', () => {
    expect(roundSuggestion({ reps: 58 / 3 }).reps).toBe(19)
    expect(roundSuggestion({ reps: 11.5 }).reps).toBe(12)
  })

  it('peso mantém a fração real (2,5 kg) mas não 12 casas', () => {
    expect(roundSuggestion({ weight: 22.5 }).weight).toBe(22.5)
    expect(roundSuggestion({ weight: 145 / 3 }).weight).toBe(48.33)
  })

  it('RPE fica com uma casa (8,5 existe; 8,4999999 não)', () => {
    expect(roundSuggestion({ rpe: 8.5 }).rpe).toBe(8.5)
    expect(roundSuggestion({ rpe: 8.499999 }).rpe).toBe(8.5)
  })

  it('ausente continua ausente — não inventa zero', () => {
    expect(roundSuggestion({})).toEqual({ weight: null, reps: null, rpe: null })
    expect(roundSuggestion({ reps: null, weight: undefined, rpe: NaN }))
      .toEqual({ weight: null, reps: null, rpe: null })
  })

  it('nenhum valor arredondado imprime dízima', () => {
    for (const bruto of [1 / 3, 2 / 3, 58 / 3, 145 / 3, 10 / 7]) {
      const r = roundSuggestion({ weight: bruto, reps: bruto, rpe: bruto })
      for (const v of [r.weight, r.reps, r.rpe]) {
        expect(String(v)).not.toMatch(/\.\d{3,}/)
      }
    }
  })
})

describe('fiação — o valor que o DELOAD grava no log passa pelo arredondamento', () => {
  const plano = (suggestion: Record<string, unknown>) =>
    buildDeloadPatches({
      sets: [{ key: '0-0', log: {}, plannedWeight: 60, suggestion, cfg: null }],
      ratio: 0.8,
      minWeight: 0,
      baseWeight: 60,
      appliedAt: 1,
      meta: {},
    })

  it('sem arredondar, a média crua iria para o log (prova do risco)', () => {
    const p = plano({ weight: 60, reps: 58 / 3, rpe: 8 })
    expect(String(p.patches[0].patch.reps)).toMatch(/\.\d{3,}/)
  })

  it('com a sugestão da fonte (já arredondada), o log recebe inteiro', () => {
    const p = plano(roundSuggestion({ weight: 60, reps: 58 / 3, rpe: 8 }) as Record<string, unknown>)
    expect(p.patches[0].patch.reps).toBe('19')
  })
})

describe('source-guard — os DOIS caminhos que montam a sugestão usam a fonte', () => {
  const hook = readFileSync(
    join('src', 'components', 'workout', 'hooks', 'useWorkoutDeload.ts'),
    'utf8',
  )
  // Só o código executável: o guard não pode se satisfazer com o comentário
  // que explica por que a regra existe.
  const codigo = hook
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')

  it('o watermark do último treino (avgReps) passa por roundSuggestion', () => {
    expect(codigo).toMatch(/patch\[setKey\]\s*=\s*roundSuggestion\(/)
  })

  it('as entries do deload (latestAvgReps) passam por roundSuggestion', () => {
    expect(codigo).toMatch(/entries\[setKey\]\s*=\s*roundSuggestion\(/)
  })

  it('não sobrou atribuição de sugestão sem passar pela fonte', () => {
    const atribuicoes = codigo.match(/(?:patch|entries)\[setKey\]\s*=\s*[^;]+/g) ?? []
    expect(atribuicoes.length).toBeGreaterThan(0)
    for (const a of atribuicoes) expect(a).toContain('roundSuggestion(')
  })
})
