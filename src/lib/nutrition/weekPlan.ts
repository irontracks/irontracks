/**
 * weekPlan — monta o plano da SEMANA a partir de um dia gerado.
 *
 * Por que não gerar 7 dias na IA: seriam 7 chamadas pagas ao Gemini por clique em
 * "gerar semana", com 7 × 1–3 s de espera, e o modelo repetiria o mesmo repertório
 * de qualquer forma (o prompt é montado a partir dos mesmos alimentos do usuário).
 * Aqui é UMA chamada para o dia-base e os outros 6 saem do motor de troca — que já
 * preserva o papel do alimento e a meta de macro. Instantâneo e sem custo por dia.
 *
 * A variação é DETERMINÍSTICA: dia 1 troca o 1º item de cada refeição, dia 2 o 2º,
 * e assim por diante, acumulando o que já apareceu para não repetir. Sem
 * `Math.random()` de propósito — resultado reproduzível é testável, e duas pessoas
 * com o mesmo repertório recebem semanas coerentes em vez de sorteios.
 */

import { swapFood, type SwapCandidate } from './foodSwap'
import type { PlanDay, PlanItem, PlanMeal } from './dietPlanShape'
import { sumTotals } from './dietPlanShape'

/** Segunda a domingo: a semana de treino começa na segunda neste app. */
export const WEEK_START_WEEKDAY = 1
export const DAYS_IN_WEEK = 7

const rotateIndex = (dayOffset: number, length: number): number =>
  length > 0 ? (dayOffset - 1) % length : 0

/**
 * Deriva os 7 dias. O dia 0 é o gerado pela IA, intacto — é ele que bate a meta
 * com precisão; os outros variam em cima dele.
 *
 * Quando não há substituto para um item (repertório curto), o item FICA como está:
 * um dia parecido é melhor que um dia sem aquele alimento.
 */
export function buildWeekFromDay(baseMeals: PlanMeal[], candidates: SwapCandidate[]): PlanDay[] {
  const meals = Array.isArray(baseMeals) ? baseMeals : []
  if (!meals.length) return []

  const days: PlanDay[] = []
  // Memória por refeição+item: o que já entrou na semana não volta no dia seguinte.
  const seen = new Map<string, string[]>()

  for (let offset = 0; offset < DAYS_IN_WEEK; offset++) {
    const weekday = (WEEK_START_WEEKDAY + offset) % 7

    if (offset === 0) {
      days.push({ weekday, meals, totals: sumTotals(meals.map((m) => m.totals)) })
      continue
    }

    const dayMeals: PlanMeal[] = meals.map((meal, mealIdx) => {
      const targetIdx = rotateIndex(offset, meal.items.length)
      const items: PlanItem[] = meal.items.map((item, itemIdx) => {
        if (itemIdx !== targetIdx) return item

        const key = `${mealIdx}-${itemIdx}`
        const already = seen.get(key) ?? []
        const swapped = swapFood(item, candidates, {
          exclude: [...meal.items.map((i) => i.food), ...already],
        })
        if (!swapped) return item

        seen.set(key, [...already, swapped.food])
        return {
          food: swapped.food,
          grams: swapped.grams,
          calories: swapped.calories,
          protein: swapped.protein,
          carbs: swapped.carbs,
          fat: swapped.fat,
        }
      })

      return { ...meal, items, totals: sumTotals(items) }
    })

    days.push({ weekday, meals: dayMeals, totals: sumTotals(dayMeals.map((m) => m.totals)) })
  }

  return days
}
