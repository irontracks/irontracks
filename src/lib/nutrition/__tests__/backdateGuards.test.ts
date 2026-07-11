import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Guards da feature de BACKDATE (lançar refeição em data passada). O `resolveDateKey`
 * já é testado em mutations.test.ts (clamp de data futura). Aqui travamos as duas
 * consequências que a auditoria encontrou:
 *   BUG 2 — o push "Meta atingida hoje 🎯" só pode disparar no DIA CORRENTE (texto e
 *           metadata levam "hoje"/data; num lançamento retroativo ficariam errados).
 *   BUG 3 — os badges "Dia de descanso" / "Treino hoje" no NutritionMixer usam valores
 *           do dia corrente; ao navegar para um dia passado NÃO podem aparecer.
 */
describe('backdate — push de meta só no dia corrente', () => {
  const src = readFileSync('src/app/(app)/dashboard/nutrition/actions.ts', 'utf8')

  it('maybeNotifyDailyGoal tem early-return quando dateKey != hoje', () => {
    // A guarda precisa comparar o dateKey recebido com resolveDateKey() (= hoje).
    expect(src).toMatch(/if\s*\(\s*dateKey\s*!==\s*resolveDateKey\(\)\s*\)\s*return/)
  })
})

describe('backdate — badges de hoje gateados por isToday no Mixer', () => {
  const src = readFileSync('src/components/dashboard/nutrition/NutritionMixer.tsx', 'utf8')

  it('badge "Dia de descanso" (restDayReduction) é gateado por isToday', () => {
    expect(src).toMatch(/isToday\s*&&\s*safeNumber\(restDayReduction\)\s*>\s*0/)
  })

  it('badge "Treino hoje" (workoutCaloriesToday) é gateado por isToday', () => {
    expect(src).toMatch(/isToday\s*&&\s*safeNumber\(workoutCaloriesToday\)\s*>\s*0/)
  })
})

describe('estimateFoodAction — rate-limit + metering (custo/DoS)', () => {
  const src = readFileSync('src/app/(app)/dashboard/nutrition/actions.ts', 'utf8')
  const fn = src.slice(src.indexOf('export async function estimateFoodAction'), src.indexOf('export async function applyGeneratedMealAction'))

  it('aplica checkRateLimitAsync antes de chamar o Gemini', () => {
    expect(fn).toMatch(/checkRateLimitAsync\(/)
  })

  it('mete a cota anti-abuso ({ meter: true }) no gate VIP', () => {
    expect(fn).toMatch(/checkVipFeatureAccess\([^)]*nutrition_macros[^)]*\{\s*meter:\s*true\s*\}/)
  })
})
