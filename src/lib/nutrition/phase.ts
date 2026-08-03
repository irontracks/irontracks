/**
 * Fase nutricional (Cutting / Manutenção / Off) — a INTENÇÃO do usuário sobre a
 * própria dieta, escolhida por ele no painel ⚙ Metas.
 *
 * Antes disso a fase era ADIVINHADA a partir de `preferences.fitnessGoal`, que é o
 * objetivo de TREINO (hipertrofia, perda de peso, força, performance, saúde) — duas
 * coisas diferentes que o mapeamento colapsava numa só. O efeito colateral era real:
 * quem marcava "hipertrofia" ou "força" no perfil recebia BULK (+10% kcal) para
 * sempre, sem nunca ter pedido superávit, e não tinha como escolher manutenção sem
 * mentir sobre o objetivo de treino. Agora `nutritionPhase` manda; o `fitnessGoal`
 * segue como fallback só para quem ainda não escolheu (compat com a base atual).
 *
 * Este módulo é a FONTE ÚNICA desses mapeamentos. `mapFitnessGoal`, `mapGender` e
 * `mapActivityLevel` viviam duplicados em `dashboard/nutrition/page.tsx` e em
 * `NutritionOverlay.tsx` — duas cópias que podiam divergir em silêncio nas duas
 * superfícies que o CLAUDE.md manda manter em sincronia.
 *
 * Puro/client-safe: sem supabase/server, sem next/headers.
 */
import {
  calculateNutritionGoals,
  type ActivityLevel,
  type Gender,
  type Goal,
  type UserStats,
} from './goals'

/** A fase é exatamente o `Goal` do motor — alias por clareza de domínio. */
export type NutritionPhase = Goal

export interface PhaseOption {
  value: NutritionPhase
  /** Rótulo curto do botão. */
  label: string
  /** Efeito sobre o TDEE, mostrado abaixo do rótulo. */
  hint: string
  /** Uma linha explicando para que serve a fase. */
  description: string
}

/**
 * Ordem de exibição: déficit → manutenção → superávit (esquerda para direita, como
 * uma régua). Os números batem com GOAL_CALORIE_MULTIPLIER/GOAL_PROTEIN_G_PER_KG
 * de `goals.ts` — se lá mudar, o texto daqui mente. O guard
 * `__tests__/nutritionPhase.test.ts` trava os dois juntos.
 */
export const NUTRITION_PHASES: readonly PhaseOption[] = [
  {
    value: 'CUT',
    label: 'Cutting',
    hint: '−15% kcal',
    description: 'Déficit para perder gordura, com proteína alta (2,2 g/kg) para segurar a massa magra.',
  },
  {
    value: 'MAINTAIN',
    label: 'Manutenção',
    hint: 'TDEE',
    description: 'Come o que gasta. Peso estável — para recomposição ou pausa de dieta.',
  },
  {
    value: 'BULK',
    label: 'Off',
    hint: '+10% kcal',
    description: 'Superávit para ganhar massa, com mais carboidrato para sustentar o treino pesado.',
  },
] as const

const PHASE_VALUES: readonly NutritionPhase[] = ['CUT', 'MAINTAIN', 'BULK']

/** Aceita só as três fases conhecidas. Qualquer outra coisa → null (não escolhida). */
export function normalizeNutritionPhase(value: unknown): NutritionPhase | null {
  const v = String(value ?? '').trim().toUpperCase()
  return (PHASE_VALUES as readonly string[]).includes(v) ? (v as NutritionPhase) : null
}

/**
 * Fallback legado: deriva a fase do objetivo de TREINO, para quem nunca escolheu
 * uma fase explícita. Mantido idêntico ao comportamento anterior de propósito — a
 * meta de quem já usa o app não pode mudar sozinha só porque este código nasceu.
 */
export function mapFitnessGoal(fitnessGoal: string | null | undefined): NutritionPhase {
  switch (fitnessGoal) {
    case 'weight_loss':
      return 'CUT'
    case 'hypertrophy':
    case 'strength':
      return 'BULK'
    default:
      return 'MAINTAIN'
  }
}

/** `preferences.biologicalSex` → Gender do motor. Sem sexo informado, não dá para calcular BMR. */
export function mapGender(sex: string | null | undefined): Gender | null {
  if (sex === 'male') return 'MALE'
  if (sex === 'female') return 'FEMALE'
  return null
}

/** Frequência semanal de treino → multiplicador de atividade do TDEE. */
export function mapActivityLevel(freqPerWeek: number | null | undefined): ActivityLevel {
  const f = Number(freqPerWeek)
  if (!Number.isFinite(f) || f <= 0) return 'MODERATE'
  if (f <= 1) return 'LIGHT'
  if (f <= 3) return 'MODERATE'
  if (f <= 5) return 'VERY_ACTIVE'
  return 'EXTRA_ACTIVE'
}

/**
 * A fase que vale para este usuário: escolha explícita primeiro, objetivo de treino
 * como fallback. É o único lugar que decide isso — página e overlay chamam daqui.
 */
export function resolveNutritionPhase(prefs: Record<string, unknown> | null | undefined): NutritionPhase {
  const explicit = normalizeNutritionPhase(prefs?.nutritionPhase)
  if (explicit) return explicit
  return mapFitnessGoal(prefs?.fitnessGoal as string | null | undefined)
}

/**
 * Extrai os dados do perfil necessários para o TDEE. Devolve null quando falta
 * qualquer um deles — sem peso/altura/idade/sexo não há BMR, e chutar um valor daria
 * uma meta inventada com cara de personalizada.
 */
export function extractProfileStats(prefs: Record<string, unknown> | null | undefined): UserStats | null {
  if (!prefs) return null
  const weight = Number(prefs.bodyWeightKg)
  const height = Number(prefs.heightCm)
  const age = Number(prefs.age)
  const gender = mapGender(prefs.biologicalSex as string | null | undefined)
  if (!Number.isFinite(weight) || weight <= 0) return null
  if (!Number.isFinite(height) || height <= 0) return null
  if (!Number.isFinite(age) || age <= 0) return null
  if (!gender) return null

  return {
    weight,
    height,
    age,
    gender,
    activityLevel: mapActivityLevel(prefs.trainingFrequencyPerWeek as number | null | undefined),
  }
}

export interface NutritionTargets {
  calories: number
  protein: number
  carbs: number
  fat: number
}

/**
 * Meta calculada a partir do perfil. `phaseOverride` permite prever o resultado de
 * outra fase sem gravar nada — é o que alimenta o seletor enquanto o usuário decide.
 * Null quando o perfil está incompleto ou o motor rejeita as entradas.
 */
export function computeGoalsFromPrefs(
  prefs: Record<string, unknown> | null | undefined,
  phaseOverride?: NutritionPhase | null,
): NutritionTargets | null {
  const stats = extractProfileStats(prefs)
  if (!stats) return null
  const phase = phaseOverride ?? resolveNutritionPhase(prefs)
  try {
    return calculateNutritionGoals(stats, phase)
  } catch {
    // Entradas fora de faixa (o motor valida e lança) → sem meta calculada.
    return null
  }
}

/** Mesma coisa, a partir das stats já extraídas — evita reextrair a cada troca de fase no seletor. */
export function computeGoalsForPhase(
  stats: UserStats | null | undefined,
  phase: NutritionPhase,
): NutritionTargets | null {
  if (!stats) return null
  try {
    return calculateNutritionGoals(stats, phase)
  } catch {
    return null
  }
}
