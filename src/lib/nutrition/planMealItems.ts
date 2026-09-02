import type { MealItem } from './engine'
import type { PlanMeal, PlanItem } from './dietPlanShape'

/**
 * Itens de uma refeição do PLANO no formato que o diário grava.
 *
 * Existe porque as três telas que lançam refeição do plano (`MyDietPlan`,
 * `PrescribedDietPlan`, `DietGenerator`) mandavam só o NOME e os TOTAIS para o
 * `applyGeneratedMealAction`. O diário recebia um item único chamado "Jantar"
 * com `grams: 0` — e item sem gramas não é editável (`quantidadeEditavel`
 * devolve null de propósito, para não inventar uma medição que ninguém fez).
 * Relatado pelo dono em 02/09/2026: lançou o jantar da dieta semanal e não
 * conseguiu corrigir nada.
 *
 * O dado sempre esteve na mão de quem lançava: `PlanMeal.items` traz alimento,
 * gramas e macros de cada um. O padrão certo já existia 50 linhas abaixo, no
 * `applyChatSimulationAction`, que persiste os itens do card. Era lapso, não
 * desenho.
 *
 * Fonte única para não repetir a conversão em três lugares — é a duplicação
 * que este repo já pagou caro na nutrição.
 */
export function planMealToLogItems(meal: Pick<PlanMeal, 'items'> | null | undefined): MealItem[] {
  const items = Array.isArray(meal?.items) ? meal.items : []
  return items
    .map((it: PlanItem) => ({
      label: String(it?.food ?? '').trim(),
      grams: Math.max(0, Number(it?.grams) || 0),
      calories: Math.max(0, Number(it?.calories) || 0),
      protein: Math.max(0, Number(it?.protein) || 0),
      carbs: Math.max(0, Number(it?.carbs) || 0),
      fat: Math.max(0, Number(it?.fat) || 0),
    }))
    // Item sem nome não vira linha do diário: o usuário veria um campo mudo que
    // não dá para editar nem entender.
    .filter((it) => it.label.length > 0)
}
