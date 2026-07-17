/**
 * Divisão de macros em % — por CALORIA (Atwater 4/4/9), não por grama.
 *
 * O card de refeição mostrava % por grama: `protein / (P+C+G)`. Isso não é o % de
 * energia nem o % de peso do prato (ignora água e fibra) — não significa nada
 * nutricionalmente, e engana onde mais importa. Um almoço P70 C69 G42 aparecia como
 * "23% gordura" quando 40% das calorias dele são gordura (42g × 9 = 378 kcal, o
 * macro mais calórico do prato). A convenção universal (MyFitnessPal etc.) é % de
 * energia, que é o que orienta decisão de dieta.
 *
 * Puro/client-safe.
 */

/** kcal/grama de cada macro (fatores de Atwater). */
export const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 } as const

export interface MacroSplit {
  protein: number
  carbs: number
  fat: number
}

const g = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/**
 * % de CALORIAS de cada macro. Soma exatamente 100 (a gordura recebe o resto, pra
 * o arredondamento nunca dar 99 ou 101). Tudo zero → 0/0/0.
 */
export function macroCaloriePercents(macros: Partial<MacroSplit> | null | undefined): MacroSplit {
  const pKcal = g(macros?.protein) * KCAL_PER_G.protein
  const cKcal = g(macros?.carbs) * KCAL_PER_G.carbs
  const fKcal = g(macros?.fat) * KCAL_PER_G.fat
  const total = pKcal + cKcal + fKcal
  if (total <= 0) return { protein: 0, carbs: 0, fat: 0 }

  const protein = Math.round((pKcal / total) * 100)
  const carbs = Math.round((cKcal / total) * 100)
  // Resto pra fechar 100 sem drift de arredondamento; nunca negativo.
  const fat = Math.max(0, 100 - protein - carbs)
  return { protein, carbs, fat }
}
