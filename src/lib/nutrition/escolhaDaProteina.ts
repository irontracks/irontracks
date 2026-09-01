/**
 * O que vai ser LANÇADO quando o usuário escolhe a segunda opção de proteína.
 *
 * A escolha é do LANÇAMENTO, não do plano: o card oferece "opção: 200 g de carne
 * moída" embaixo do frango, o usuário marca, e o que entra no diário é a carne — o
 * plano da terça continua dizendo frango. Quem quer mudar o PLANO tem o ↻, que
 * grava. Colapsar as duas coisas faria uma decisão de hoje reescrever a semana
 * inteira sem ninguém pedir.
 *
 * Os totais são sempre RECOMPUTADOS dos itens, nunca ajustados por diferença: é a
 * mesma regra do `planDays` (que nunca lê total gravado), e somar/subtrair deltas
 * acumula erro de arredondamento a cada troca.
 */

import { sumTotals, type PlanItem, type PlanMeal } from './dietPlanShape'

/**
 * @param meal refeição do plano
 * @param escolhas item substituto por ÍNDICE do item original
 */
export function refeicaoComEscolhas(
    meal: PlanMeal,
    escolhas: ReadonlyMap<number, PlanItem>,
): PlanMeal {
    if (!escolhas.size) return meal
    const items = meal.items.map((item, i) => escolhas.get(i) ?? item)
    return { ...meal, items, totals: sumTotals(items) }
}
