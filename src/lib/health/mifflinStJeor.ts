/**
 * @module mifflinStJeor
 *
 * Taxa metabólica basal (TMB/BMR) e gasto total (TDEE) — a FÓRMULA, num lugar só.
 *
 * Estava escrita duas vezes, com os mesmos coeficientes: em
 * `utils/calculations/bodyComposition.ts` (avaliação física) e em
 * `lib/nutrition/goals.ts` (metas de nutrição). Auditoria de 23/08/2026: as duas
 * concordavam — divergiam só no arredondamento (2 casas × inteiro) e no
 * vocabulário de sexo (`'M'/'F'` × `'MALE'/'FEMALE'`), então nenhum usuário viu
 * número errado.
 *
 * É o tipo de duplicação que não quebra nada hoje e diverge no dia em que
 * alguém ajustar um coeficiente de um lado só — exatamente o que já aconteceu
 * aqui com a soma das dobras, com a meta de nutrição e com a chave do treino.
 * As duas APIs de domínio continuam existindo (assinaturas diferentes servem a
 * chamadores diferentes); o que não se repete mais é a CONTA.
 *
 * Mifflin-St Jeor é o padrão atual da literatura — substituiu a
 * Harris-Benedict, que superestimava ~5%.
 */

/** Aceita os dois vocabulários que o app usa para sexo biológico. */
export type BiologicalSex = 'M' | 'F' | 'MALE' | 'FEMALE'

export interface BmrInput {
  /** kg */
  weightKg: number
  /** cm */
  heightCm: number
  /** anos */
  ageYears: number
  sex: BiologicalSex
}

const isMale = (sex: BiologicalSex): boolean => sex === 'M' || sex === 'MALE'

/**
 * TMB em kcal/dia. `null` quando falta dado ou o dado é impossível — quem
 * chama decide se lança (avaliação) ou segue sem (nutrição).
 *
 * Arredonda para INTEIRO: as duas superfícies já exibiam assim
 * (`bmr.toFixed(0)` na avaliação) e todos os valores gravados no banco eram
 * redondos, então a unificação não move nenhum número que alguém já viu.
 */
export function basalMetabolicRate(input: BmrInput): number | null {
  const weight = Number(input?.weightKg)
  const height = Number(input?.heightCm)
  const age = Number(input?.ageYears)
  if (!Number.isFinite(weight) || weight <= 0) return null
  if (!Number.isFinite(height) || height <= 0) return null
  if (!Number.isFinite(age) || age <= 0) return null

  // Mifflin-St Jeor. Homem: +5; mulher: −161.
  const bmr = 10 * weight + 6.25 * height - 5 * age + (isMale(input.sex) ? 5 : -161)
  if (!Number.isFinite(bmr) || bmr <= 0) return null
  return Math.round(bmr)
}

/** TDEE = TMB × fator de atividade. `null` com entrada inválida. */
export function totalDailyEnergyExpenditure(bmr: number, activityFactor: number): number | null {
  const b = Number(bmr)
  const f = Number(activityFactor)
  if (!Number.isFinite(b) || b <= 0) return null
  if (!Number.isFinite(f) || f <= 0) return null
  return Math.round(b * f)
}
