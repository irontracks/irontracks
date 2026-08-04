import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

import {
  NUTRITION_PHASES,
  computeGoalsForPhase,
  computeGoalsFromPrefs,
  extractProfileStats,
  mapActivityLevel,
  mapFitnessGoal,
  normalizeNutritionPhase,
  resolveNutritionPhase,
} from '../phase'
import { calculateTDEE, type UserStats } from '../goals'

/** Perfil completo de referência: 80 kg, 180 cm, 30 anos, homem, 3 treinos/semana. */
const STATS: UserStats = {
  weight: 80,
  height: 180,
  age: 30,
  gender: 'MALE',
  activityLevel: 'MODERATE',
}

const PREFS_COMPLETE = {
  bodyWeightKg: 80,
  heightCm: 180,
  age: 30,
  biologicalSex: 'male',
  trainingFrequencyPerWeek: 3,
}

describe('normalizeNutritionPhase', () => {
  it('aceita as três fases, inclusive em caixa baixa', () => {
    expect(normalizeNutritionPhase('CUT')).toBe('CUT')
    expect(normalizeNutritionPhase('cut')).toBe('CUT')
    expect(normalizeNutritionPhase(' bulk ')).toBe('BULK')
    expect(normalizeNutritionPhase('MAINTAIN')).toBe('MAINTAIN')
  })

  it('rejeita qualquer outra coisa', () => {
    for (const bad of ['', 'CUTTING', 'off', 'hypertrophy', null, undefined, 0, {}, []]) {
      expect(normalizeNutritionPhase(bad)).toBeNull()
    }
  })
})

describe('resolveNutritionPhase — a escolha do usuário manda', () => {
  it('a fase explícita vence o objetivo de treino', () => {
    // O caso que motivou a feature: treina hipertrofia (→ BULK no legado) mas está
    // em cutting. Antes era impossível expressar isso.
    expect(resolveNutritionPhase({ fitnessGoal: 'hypertrophy', nutritionPhase: 'CUT' })).toBe('CUT')
    expect(resolveNutritionPhase({ fitnessGoal: 'weight_loss', nutritionPhase: 'BULK' })).toBe('BULK')
    expect(resolveNutritionPhase({ fitnessGoal: 'hypertrophy', nutritionPhase: 'MAINTAIN' })).toBe('MAINTAIN')
  })

  it('fase inválida no banco cai no fallback em vez de quebrar', () => {
    expect(resolveNutritionPhase({ fitnessGoal: 'weight_loss', nutritionPhase: 'LIXO' })).toBe('CUT')
  })

  it('sem fase escolhida, preserva EXATAMENTE o comportamento legado', () => {
    // Guard de compatibilidade: a meta de quem já usa o app não pode mudar sozinha
    // só porque o seletor passou a existir.
    expect(resolveNutritionPhase({ fitnessGoal: 'weight_loss' })).toBe('CUT')
    expect(resolveNutritionPhase({ fitnessGoal: 'hypertrophy' })).toBe('BULK')
    expect(resolveNutritionPhase({ fitnessGoal: 'strength' })).toBe('BULK')
    expect(resolveNutritionPhase({ fitnessGoal: 'performance' })).toBe('MAINTAIN')
    expect(resolveNutritionPhase({ fitnessGoal: 'health' })).toBe('MAINTAIN')
    expect(resolveNutritionPhase({ fitnessGoal: 'not_informed' })).toBe('MAINTAIN')
    expect(resolveNutritionPhase({})).toBe('MAINTAIN')
    expect(resolveNutritionPhase(null)).toBe('MAINTAIN')
  })
})

describe('extractProfileStats', () => {
  it('extrai o perfil completo', () => {
    expect(extractProfileStats(PREFS_COMPLETE)).toEqual(STATS)
  })

  it('devolve null faltando QUALQUER campo do BMR', () => {
    for (const missing of ['bodyWeightKg', 'heightCm', 'age', 'biologicalSex']) {
      const prefs: Record<string, unknown> = { ...PREFS_COMPLETE }
      delete prefs[missing]
      expect(extractProfileStats(prefs), `sem ${missing}`).toBeNull()
    }
    expect(extractProfileStats({ ...PREFS_COMPLETE, biologicalSex: 'not_informed' })).toBeNull()
    expect(extractProfileStats({ ...PREFS_COMPLETE, bodyWeightKg: 0 })).toBeNull()
    expect(extractProfileStats({ ...PREFS_COMPLETE, heightCm: -1 })).toBeNull()
    expect(extractProfileStats(null)).toBeNull()
  })

  it('frequência de treino ausente não invalida o perfil (cai em MODERATE)', () => {
    const prefs = { ...PREFS_COMPLETE, trainingFrequencyPerWeek: undefined }
    expect(extractProfileStats(prefs)?.activityLevel).toBe('MODERATE')
  })
})

describe('mapActivityLevel', () => {
  it('mapeia a frequência semanal por faixa', () => {
    expect(mapActivityLevel(1)).toBe('LIGHT')
    expect(mapActivityLevel(3)).toBe('MODERATE')
    expect(mapActivityLevel(5)).toBe('VERY_ACTIVE')
    expect(mapActivityLevel(7)).toBe('EXTRA_ACTIVE')
    expect(mapActivityLevel(0)).toBe('MODERATE')
    expect(mapActivityLevel(null)).toBe('MODERATE')
  })
})

describe('metas por fase', () => {
  const tdee = calculateTDEE(STATS)

  it('CUT < MANUTENÇÃO < OFF em calorias', () => {
    const cut = computeGoalsForPhase(STATS, 'CUT')!
    const maintain = computeGoalsForPhase(STATS, 'MAINTAIN')!
    const bulk = computeGoalsForPhase(STATS, 'BULK')!
    expect(cut.calories).toBeLessThan(maintain.calories)
    expect(maintain.calories).toBeLessThan(bulk.calories)
    expect(maintain.calories).toBe(tdee)
  })

  it('mais proteína no corte, menos no off (preserva massa magra em déficit)', () => {
    const cut = computeGoalsForPhase(STATS, 'CUT')!
    const maintain = computeGoalsForPhase(STATS, 'MAINTAIN')!
    const bulk = computeGoalsForPhase(STATS, 'BULK')!
    expect(cut.protein).toBeGreaterThan(maintain.protein)
    expect(maintain.protein).toBeGreaterThan(bulk.protein)
  })

  it('o texto de cada botão bate com o que o motor faz de verdade', () => {
    // Guard do descompasso silencioso: mexer em GOAL_CALORIE_MULTIPLIER (goals.ts)
    // sem atualizar o `hint` (phase.ts) deixaria a UI prometendo "−15%" enquanto
    // aplica outra coisa. Aqui o texto é conferido contra o cálculo real.
    for (const opt of NUTRITION_PHASES) {
      const goals = computeGoalsForPhase(STATS, opt.value)!
      const deltaPct = Math.round(((goals.calories - tdee) / tdee) * 100)
      // O hint usa o sinal de menos tipográfico (−, U+2212), não o hífen ASCII.
      const claimed = opt.hint.replace(/−/g, '-').match(/([+-]\d+)\s*%/)
      if (claimed) {
        expect(Number(claimed[1]), `hint de ${opt.label}`).toBe(deltaPct)
      } else {
        // Sem percentual no texto (Manutenção) → tem que ser o TDEE puro.
        expect(deltaPct, `hint de ${opt.label}`).toBe(0)
      }
    }
  })

  it('as três fases aparecem na ordem déficit → superávit', () => {
    expect(NUTRITION_PHASES.map(p => p.value)).toEqual(['CUT', 'MAINTAIN', 'BULK'])
  })

  it('perfil incompleto não produz meta inventada', () => {
    expect(computeGoalsForPhase(null, 'CUT')).toBeNull()
    expect(computeGoalsFromPrefs({ bodyWeightKg: 80 })).toBeNull()
  })

  it('computeGoalsFromPrefs respeita a fase salva', () => {
    const cutting = computeGoalsFromPrefs({ ...PREFS_COMPLETE, fitnessGoal: 'hypertrophy', nutritionPhase: 'CUT' })!
    const derived = computeGoalsFromPrefs({ ...PREFS_COMPLETE, fitnessGoal: 'hypertrophy' })!
    expect(cutting.calories).toBeLessThan(derived.calories)
    expect(cutting).toEqual(computeGoalsForPhase(STATS, 'CUT'))
  })

  it('o override tem precedência sobre a fase salva (preview do seletor)', () => {
    const preview = computeGoalsFromPrefs({ ...PREFS_COMPLETE, nutritionPhase: 'CUT' }, 'BULK')!
    expect(preview).toEqual(computeGoalsForPhase(STATS, 'BULK'))
  })
})

describe('fonte única dos mapeamentos de perfil', () => {
  // As duas superfícies de nutrição (página + overlay) já tiveram cópias próprias
  // destes helpers, que divergiram em silêncio — o CLAUDE.md manda mantê-las em
  // sincronia. Este guard falha se alguém recriar a cópia em vez de importar.
  const CONSUMERS = [
    'src/app/(app)/dashboard/nutrition/page.tsx',
    'src/components/dashboard/nutrition/NutritionOverlay.tsx',
  ]

  /**
   * As superfícies passaram a consumir a fonte única INDIRETAMENTE, pelo leitor
   * único (`lib/user/snapshot`) e pela política de exibição (`displayGoals`) — que
   * por sua vez importam de `phase`. Exigir o import direto passou a reprovar
   * justamente a arquitetura que este guard quer: fonte única, um caminho só.
   *
   * O que ele protege NÃO mudou: recriar os mapeamentos localmente segue vermelho.
   */
  const FONTE_UNICA = /from '@\/lib\/(nutrition\/phase|nutrition\/displayGoals|user\/snapshot)'/

  for (const file of CONSUMERS) {
    it(`${file} consome a fonte única em vez de redefinir`, () => {
      const src = readFileSync(file, 'utf8')
      expect(src).toMatch(FONTE_UNICA)
      expect(src, 'redefiniu mapFitnessGoal localmente').not.toMatch(/function\s+mapFitnessGoal/)
      expect(src, 'redefiniu mapGender localmente').not.toMatch(/function\s+mapGender/)
      expect(src, 'redefiniu mapActivityLevel localmente').not.toMatch(/function\s+mapActivityLevel/)
    })
  }

  it('mapFitnessGoal segue exportado como fallback legado', () => {
    expect(typeof mapFitnessGoal).toBe('function')
  })
})
