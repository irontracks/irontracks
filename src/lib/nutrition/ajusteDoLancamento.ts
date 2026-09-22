/**
 * O que vai ser LANÇADO quando o usuário adiciona/remove/redimensiona um item
 * da refeição do plano, antes de lançar (22/09/2026, pedido do dono).
 *
 * Mesma tese de `escolhaDaProteina.ts`: o ajuste é do LANÇAMENTO, não do
 * plano — tirar o pimentão de hoje porque acabou em casa não reescreve o
 * cardápio da semana. Quem quer mudar o PLANO de verdade usa o ↻ (troca por
 * alternativa) ou a edição de item da ficha, que gravam. Confirmado com o
 * dono, 22/09/2026: "só o lançamento de hoje" — colapsar as duas coisas faria
 * um ajuste de um dia ruim reescrever a semana inteira sem ninguém pedir.
 *
 * Os totais são sempre RECOMPUTADOS da lista final de itens, nunca por soma
 * de deltas — mesma regra de `dietPlanShape`/`refeicaoComEscolhas`.
 */

import { sumTotals, type PlanItem, type PlanMeal } from './dietPlanShape'
import { refeicaoComEscolhas } from './escolhaDaProteina'

/** Teto de sanidade: acima disso é erro de digitação, não porção real. */
export const QUANTIDADE_MAXIMA_G = 5000

export interface AjustesDoLancamento {
  /** Índices (no array ORIGINAL de `meal.items`) marcados pra sair do lançamento. */
  removidos: ReadonlySet<number>
  /** Índice original → nova quantidade em gramas. */
  quantidades: ReadonlyMap<number, number>
  /** Itens extras, sem correspondência no plano original. */
  adicionados: readonly PlanItem[]
}

export const AJUSTES_VAZIOS: AjustesDoLancamento = { removidos: new Set(), quantidades: new Map(), adicionados: [] }

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * Reescala um item do PLANO para uma nova quantidade em gramas — todos os
 * macros na mesma proporção. Ao contrário do irmão `reescalarItem`
 * (`mealItemQuantity.ts`, usado no diário já lançado), aqui não existe
 * quantidade embutida no nome: `PlanItem.food` é sempre o nome limpo
 * ("Arroz branco cozido"), nunca "250g arroz" — não há rótulo pra reescrever.
 *
 * `novoValor` inválido ou item sem gramas (`grams <= 0`, sem base pra
 * proporção) devolve o item INTACTO — mesma trava do irmão, pela mesma razão:
 * campo em branco durante a digitação não pode zerar a refeição, e não há
 * como inventar proporção sem densidade conhecida.
 */
export function reescalarPlanItem(item: PlanItem, novoValor: number): PlanItem {
  const gramsAtual = num(item.grams)
  if (gramsAtual <= 0) return item
  if (!Number.isFinite(novoValor) || novoValor <= 0) return item
  const alvo = Math.min(novoValor, QUANTIDADE_MAXIMA_G)
  const fator = alvo / gramsAtual
  if (!Number.isFinite(fator) || fator <= 0) return item
  return {
    food: item.food,
    grams: Math.round(gramsAtual * fator),
    calories: Math.round(num(item.calories) * fator),
    protein: Math.round(num(item.protein) * fator * 10) / 10,
    carbs: Math.round(num(item.carbs) * fator * 10) / 10,
    fat: Math.round(num(item.fat) * fator * 10) / 10,
  }
}

/**
 * Compõe a refeição que será de fato lançada: troca por "Opção" (por
 * ÍNDICE original) → reescala de quantidade → remoção → itens adicionados.
 * Ordem importa: reescala e remoção agem sobre o item já trocado (o usuário
 * pode escolher a "Opção: peito de frango" e DEPOIS ajustar a gramatura dela).
 *
 * Usada tanto para EXIBIR o card quanto para o que `applyMeal` de fato manda
 * ao diário — a mesma função nos dois pontos, para tela e lançamento nunca
 * discordarem em dois toques (a mesma regra que `refeicaoComEscolhas` já
 * documentava).
 */
export function refeicaoParaLancamento(
  meal: PlanMeal,
  escolhas: ReadonlyMap<number, PlanItem>,
  ajustes: AjustesDoLancamento,
): PlanMeal {
  const trocada = refeicaoComEscolhas(meal, escolhas)
  const base = trocada.items
    .map((item, i) => {
      const novaQtd = ajustes.quantidades.get(i)
      return novaQtd !== undefined ? reescalarPlanItem(item, novaQtd) : item
    })
    .filter((_, i) => !ajustes.removidos.has(i))
  const items = [...base, ...ajustes.adicionados]
  return { ...meal, items, totals: sumTotals(items) }
}
