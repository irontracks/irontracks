import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

import { DEFAULT_GOALS, resolveDisplayGoals } from '../displayGoals'
import type { NutritionFacts } from '@/lib/user/snapshot'

/**
 * A política de EXIBIÇÃO da meta (piso + rótulo da origem) é a última coisa que
 * estava escrita duas vezes — com a constante `DEFAULT_GOALS` copiada na página e no
 * overlay. Nas duas superfícies que o CLAUDE.md manda manter em sincronia.
 */

const facts = (over: Partial<NutritionFacts>): NutritionFacts => ({
  targets: null,
  targetsSource: null,
  savedGoalsError: null,
  restDayAdjustEnabled: true,
  ...over,
})

describe('resolveDisplayGoals', () => {
  it('meta salva chega intacta e rotulada como salva', () => {
    const r = resolveDisplayGoals(
      facts({ targets: { calories: 2676, protein: 208, carbs: 295, fat: 74 }, targetsSource: 'saved' }),
    )
    expect(r.goals).toEqual({ calories: 2676, protein: 208, carbs: 295, fat: 74 })
    expect(r.source).toBe('saved')
  })

  it('meta derivada vira `profile` — é o rótulo que a UI usa para oferecer "Ajustar"', () => {
    const r = resolveDisplayGoals(
      facts({ targets: { calories: 3100, protein: 200, carbs: 350, fat: 90 }, targetsSource: 'derived' }),
    )
    expect(r.source).toBe('profile')
  })

  it('sem meta nenhuma, cai no default e assume que é default', () => {
    expect(resolveDisplayGoals(facts({}))).toEqual({ goals: DEFAULT_GOALS, source: 'default' })
    expect(resolveDisplayGoals(null)).toEqual({ goals: DEFAULT_GOALS, source: 'default' })
  })

  it('macro zerado cai no piso sem contaminar os outros', () => {
    const r = resolveDisplayGoals(
      facts({ targets: { calories: 2676, protein: 0, carbs: 295, fat: 74 }, targetsSource: 'saved' }),
    )
    // A tela não anuncia "0 g de proteína" como alvo…
    expect(r.goals.protein).toBe(DEFAULT_GOALS.protein)
    // …e as calorias que o usuário salvou continuam sendo as dele.
    expect(r.goals.calories).toBe(2676)
    expect(r.source).toBe('saved')
  })
})

describe('DEFAULT_GOALS mora num lugar só', () => {
  const superficies = [
    'src/app/(app)/dashboard/nutrition/page.tsx',
    'src/components/dashboard/nutrition/NutritionOverlay.tsx',
  ]

  it.each(superficies)('%s não redeclara a constante', (arquivo) => {
    const code = readFileSync(arquivo, 'utf8')
    expect(code).not.toMatch(/const\s+DEFAULT_GOALS\s*[:=]/)
  })

  it.each(superficies)('%s resolve a meta pela política compartilhada', (arquivo) => {
    expect(readFileSync(arquivo, 'utf8')).toMatch(/resolveDisplayGoals/)
  })
})
