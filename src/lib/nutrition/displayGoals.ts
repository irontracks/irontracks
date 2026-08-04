import type { NutritionTargets } from './phase'
import type { NutritionFacts } from '@/lib/user/snapshot'

/**
 * Política de EXIBIÇÃO da meta — o último passo entre o fato e a tela.
 *
 * O `userSnapshot` entrega o fato ("a meta salva é X" / "não há meta, o TDEE dá Y" /
 * "não dá para saber"). Quem exibe precisa mostrar ALGUMA coisa mesmo no terceiro
 * caso, e essa decisão — cair num default e rotular a origem — era escrita duas
 * vezes, com a constante `DEFAULT_GOALS` copiada na página e no overlay. Duas cópias
 * da mesma política nas duas superfícies que o CLAUDE.md manda manter em sincronia é
 * exatamente como a nutrição já divergiu antes (o cálculo de meta, e depois os
 * mapeamentos de perfil).
 *
 * Client-safe e puro: só transforma o que já foi lido.
 */

/** Meta de partida para quem não tem meta salva nem perfil completo. */
export const DEFAULT_GOALS: NutritionTargets = {
  calories: 2000,
  protein: 150,
  carbs: 200,
  fat: 60,
}

/**
 * Como a meta chegou à tela:
 *  - `saved`   — o usuário salvou;
 *  - `profile` — calculada do TDEE (a UI rotula e oferece "Ajustar");
 *  - `default` — nem meta nem perfil; números de partida.
 */
export type DisplayGoalsSource = 'saved' | 'profile' | 'default'

export interface DisplayGoals {
  goals: NutritionTargets
  source: DisplayGoalsSource
}

/**
 * Macro zerado ou ausente cai no default: a tela não pode anunciar "0 g de proteína"
 * como se fosse alvo. Aplicado macro a macro de propósito — uma meta salva com
 * calorias válidas e proteína zerada continua sendo a meta do usuário nas calorias.
 */
function floor(target: NutritionTargets): NutritionTargets {
  return {
    calories: target.calories > 0 ? target.calories : DEFAULT_GOALS.calories,
    protein: target.protein > 0 ? target.protein : DEFAULT_GOALS.protein,
    carbs: target.carbs > 0 ? target.carbs : DEFAULT_GOALS.carbs,
    fat: target.fat > 0 ? target.fat : DEFAULT_GOALS.fat,
  }
}

/** Traduz os fatos do setor `nutrition` do snapshot no par (meta, origem) da tela. */
export function resolveDisplayGoals(nutrition: NutritionFacts | null | undefined): DisplayGoals {
  if (!nutrition?.targets) return { goals: DEFAULT_GOALS, source: 'default' }
  return {
    goals: floor(nutrition.targets),
    source: nutrition.targetsSource === 'saved' ? 'saved' : 'profile',
  }
}
