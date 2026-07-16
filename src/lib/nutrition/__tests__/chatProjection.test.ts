import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  projectMeal,
  projectMacro,
  MEAL_CEILINGS,
  MACRO_KEYS,
} from '../chatProjection'

/**
 * projectMeal é a autoridade dos números do chat de nutrição ("se eu comer 5 ovos,
 * pra quanto vai?") e do preview ao vivo do campo de lançamento.
 */
describe('projectMeal — os 4 macros', () => {
  const consumed = { calories: 2020, protein: 150, carbs: 260, fat: 70 }
  const goals = { calories: 2900, protein: 215, carbs: 350, fat: 70 }
  // 5 ovos cozidos ≈ 390 kcal / 32P / 2C / 28G
  const eggs = { calories: 390, protein: 32, carbs: 2, fat: 28 }

  it('projeta TODOS os macros, não só kcal (o previewImpact antigo só fazia kcal)', () => {
    const p = projectMeal(consumed, goals, eggs)
    expect(MACRO_KEYS.every((k) => typeof p[k].projected === 'number')).toBe(true)

    expect(p.calories.projected).toBe(2410)
    expect(p.calories.remaining).toBe(490)
    expect(p.calories.over).toBe(false)

    expect(p.protein.projected).toBe(182)
    expect(p.protein.remaining).toBe(33)
  })

  it('marca estouro por macro de forma independente', () => {
    // A gordura já está NA meta (70/70); os ovos estouram só ela.
    const p = projectMeal(consumed, goals, eggs)
    expect(p.fat.projected).toBe(98)
    expect(p.fat.over).toBe(true)
    expect(p.fat.remaining).toBe(-28)
    // ...sem contaminar as calorias, que ainda cabem.
    expect(p.calories.over).toBe(false)
  })
})

describe('meta ausente não vira meta zero', () => {
  it('sem meta → goal/remaining null e over false (não "faltam -2600 kcal")', () => {
    const p = projectMeal({ calories: 2600 }, null, { calories: 390 })
    expect(p.calories.projected).toBe(2990)
    expect(p.calories.goal).toBeNull()
    expect(p.calories.remaining).toBeNull()
    expect(p.calories.over).toBe(false)
  })

  it('meta 0 ou negativa é tratada como ausente', () => {
    expect(projectMeal({ calories: 100 }, { calories: 0 }, { calories: 10 }).calories.remaining).toBeNull()
    expect(projectMeal({ calories: 100 }, { calories: -5 }, { calories: 10 }).calories.over).toBe(false)
  })
})

describe('entradas sujas não viram NaN na tela', () => {
  it('null/undefined/NaN/negativo/Infinity → 0', () => {
    const p = projectMeal(null, null, null)
    expect(p.calories.projected).toBe(0)
    expect(p.protein.add).toBe(0)

    expect(projectMacro(NaN, null, NaN, 6000).projected).toBe(0)
    expect(projectMacro(-50, null, -10, 6000).projected).toBe(0)
    expect(projectMacro(Infinity, null, 10, 6000).projected).toBe(10)
    expect(projectMacro('120' as unknown, null, '30' as unknown, 6000).projected).toBe(150)
  })
})

describe('clamp — o card não pode prometer o que o diário vai recusar', () => {
  it('clampa a refeição nos mesmos tetos do diário', () => {
    const p = projectMeal(
      { calories: 0, protein: 0, carbs: 0, fat: 0 },
      null,
      { calories: 999_999, protein: 999, carbs: 9_999, fat: 999 },
    )
    expect(p.calories.add).toBe(6000)
    expect(p.protein.add).toBe(400)
    expect(p.carbs.add).toBe(800)
    expect(p.fat.add).toBe(300)
  })

  it('os tetos são os MESMOS que o trackMeal aplica (source-guard anti-drift)', () => {
    // MEAL_CEILINGS duplica os literais do engine de propósito (o engine é server-only,
    // este módulo roda no cliente). Se um lado mudar sem o outro, isto quebra.
    const engine = readFileSync(join(process.cwd(), 'src/lib/nutrition/engine.ts'), 'utf8')
    expect(engine).toContain(`Math.min(${MEAL_CEILINGS.calories}, calories)`)
    expect(engine).toContain(`Math.min(${MEAL_CEILINGS.protein}, protein)`)
    expect(engine).toContain(`Math.min(${MEAL_CEILINGS.carbs}, carbs)`)
    expect(engine).toContain(`Math.min(${MEAL_CEILINGS.fat}, fat)`)
  })
})

describe('paridade de arredondamento com o diário', () => {
  /**
   * O diário faz: entries gravadas CRUAS (clampadas, não arredondadas) e o total do dia
   * = Math.round(soma das cruas). Replicamos: soma cru, arredonda UMA vez no fim.
   * Arredondar a refeição antes de somar divergiria em 1 kcal — o card prometeria um
   * número e o anel mostraria outro depois de lançar.
   */
  const diaryDayTotal = (entries: number[]) => Math.round(entries.reduce((s, e) => s + e, 0))

  it('o projected é EXATAMENTE o total que o diário vai mostrar', () => {
    const existing = [300.4, 500.3, 219.7] // entries cruas já no dia
    const meal = 389.6
    const consumedRaw = existing.reduce((s, e) => s + e, 0)

    const projected = projectMacro(consumedRaw, null, meal, 6000).projected
    expect(projected).toBe(diaryDayTotal([...existing, meal]))
  })

  it('arredondar a refeição ANTES de somar divergiria (prova de que a ordem importa)', () => {
    const existing = [0.5]
    const meal = 0.5
    const naive = Math.round(existing[0]) + Math.round(meal) // 1 + 1 = 2
    const correct = projectMacro(existing[0], null, meal, 6000).projected // round(1.0) = 1
    expect(naive).toBe(2)
    expect(correct).toBe(1)
    expect(correct).toBe(diaryDayTotal([...existing, meal]))
  })

  it('projected/remaining/add/consumed são sempre inteiros (vão direto pra tela)', () => {
    const p = projectMacro(2020.4, 2900, 389.6, 6000)
    expect(Number.isInteger(p.projected)).toBe(true)
    expect(Number.isInteger(p.add)).toBe(true)
    expect(Number.isInteger(p.consumed)).toBe(true)
    expect(Number.isInteger(p.remaining as number)).toBe(true)
  })
})
