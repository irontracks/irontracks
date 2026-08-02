/**
 * Projeção "e se eu comer X agora?" — matemática PURA, sem IA e sem rede.
 *
 * Este módulo é a autoridade dos números do chat de nutrição e do preview ao vivo do
 * campo de lançamento. A IA nunca faz conta: ela interpreta a pergunta e resolve o
 * alimento; a aritmética é toda aqui.
 *
 * ── Paridade com o diário (o requisito que dita o arredondamento) ──────────────
 * `trackMeal` (engine.ts) grava a refeição CLAMPADA mas NÃO arredondada
 * (engine.ts:58-61 → :96-99), e o total do dia é `Math.round` da SOMA das entries
 * cruas (engine.ts:146-149). Por isso projetamos igual: soma cru, arredonda UMA vez
 * no fim. Arredondar a refeição antes de somar produziria divergência de 1 kcal
 * entre o que o card promete e o que o diário mostra depois de lançar — inaceitável
 * num recurso cujo pitch é precisão.
 *
 * Corolário: quem chama decide a precisão do `consumed`. O servidor (chat) passa a
 * soma CRUA das entries do dia → projeção idêntica ao diário. O cliente (preview ao
 * vivo) passa o total já arredondado de `daily_nutrition_logs` → pode divergir 1 kcal
 * do diário, o que é irrelevante num preview que muda a cada tecla.
 *
 * Sem imports de propósito: roda no cliente sem puxar `supabase/server` pro bundle
 * (mesma disciplina documentada em engine.ts:4-7).
 */

export interface MacroTotals {
  calories: number
  protein: number
  carbs: number
  fat: number
}

export const MACRO_KEYS = ['calories', 'protein', 'carbs', 'fat'] as const
export type MacroKey = (typeof MACRO_KEYS)[number]

/**
 * Tetos sanitários por refeição. ESPELHAM `trackMeal` (engine.ts:58-61) de propósito:
 * este módulo é puro/client-safe e o engine é o funil de escrita server-only. A
 * paridade dos valores é travada por teste (chatProjection.test.ts) — se um lado
 * mudar sem o outro, o teste quebra.
 */
export const MEAL_CEILINGS: MacroTotals = {
  calories: 6000,
  protein: 400,
  carbs: 800,
  fat: 300,
}

export interface MacroProjection {
  /** Quanto a refeição adiciona, já clampada como o diário clampa. Arredondado p/ exibir. */
  add: number
  /** Quanto já foi consumido no dia (como veio de quem chamou). Arredondado p/ exibir. */
  consumed: number
  /** Total do dia se a refeição for lançada — idêntico ao que o diário vai mostrar. */
  projected: number
  /** Meta do dia. `null` quando o usuário não tem meta pra este macro. */
  goal: number | null
  /** `goal - projected`. Negativo = estourou. `null` quando não há meta. */
  remaining: number | null
  /** `true` só quando há meta E ela foi ultrapassada. Sem meta não há como estourar. */
  over: boolean
}

export type MealProjection = Record<MacroKey, MacroProjection>

/** Número >= 0 utilizável, ou 0. Trata null/undefined/NaN/negativo/Infinity. */
function safeAmount(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/**
 * Meta utilizável, ou `null`. Meta 0/ausente/inválida NÃO é meta: sem isto o app diria
 * "faltam -2600 kcal" pra quem nunca definiu meta.
 */
function safeGoal(v: unknown): number | null {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Projeta um macro. `ceiling` espelha o clamp do diário. */
export function projectMacro(
  consumed: unknown,
  goal: unknown,
  addition: unknown,
  ceiling: number,
): MacroProjection {
  const consumedRaw = safeAmount(consumed)
  const addRaw = Math.min(safeAmount(ceiling), safeAmount(addition))
  const resolvedGoal = safeGoal(goal)

  // Uma única passada de arredondamento, na soma — igual ao diário.
  const projected = Math.round(consumedRaw + addRaw)

  return {
    add: Math.round(addRaw),
    consumed: Math.round(consumedRaw),
    projected,
    goal: resolvedGoal,
    remaining: resolvedGoal === null ? null : resolvedGoal - projected,
    over: resolvedGoal === null ? false : projected > resolvedGoal,
  }
}

/**
 * Projeta os 4 macros de uma vez.
 *
 * @param consumed  Consumido hoje. No servidor, passe a soma CRUA das entries.
 * @param goals     Metas do dia. Macro sem meta → `goal`/`remaining` = null.
 * @param addition  Macros da refeição simulada (do resolver determinístico ou do
 *                  fallback de IA — nunca inventados pelo modelo).
 */
export function projectMeal(
  consumed: Partial<MacroTotals> | null | undefined,
  goals: Partial<MacroTotals> | null | undefined,
  addition: Partial<MacroTotals> | null | undefined,
): MealProjection {
  const out = {} as MealProjection
  for (const key of MACRO_KEYS) {
    out[key] = projectMacro(consumed?.[key], goals?.[key], addition?.[key], MEAL_CEILINGS[key])
  }
  return out
}
