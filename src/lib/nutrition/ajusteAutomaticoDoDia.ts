/**
 * Reajuste automático de refeições — pedido do dono, 22/09/2026.
 *
 * Ideia: hoje o plano é fixo por refeição. Se a pessoa come menos arroz no
 * almoço, a diferença simplesmente se perde — a meta do dia fica "errada"
 * sem chance de recuperar. Este módulo redistribui o que sobrou/faltou nas
 * refeições do MESMO dia que AINDA NÃO foram lançadas.
 *
 * Decisões de produto (confirmadas com o dono):
 * - Só dentro do mesmo dia — não empurra para amanhã nem redistribui pela
 *   semana. A meta do app é diária, não semanal; inventar meta semanal é
 *   escopo maior, deixado para depois se fizer falta.
 * - NUNCA mexe numa refeição já lançada — "não tem como ele vomitar a
 *   comida que já mandou pra dentro". A refeição lançada aparece na tela
 *   como o usuário lançou, sempre.
 * - Puro e sem persistência: função de (plano do dia, o que já foi
 *   lançado) → refeições restantes ajustadas. Chamado toda vez que a tela
 *   abre — nunca grava o ajuste em lugar nenhum. Mesmo princípio do resto
 *   do módulo de nutrição (userSnapshot): derivado na leitura nunca fica
 *   velho, e evita uma segunda fonte de verdade.
 *
 * O QUE fica de fora nesta primeira versão, de propósito:
 * - Redistribuir um macro em MAIS de um item por refeição (resolve no
 *   primeiro item compatível que achar).
 * - Cruzar múltiplas refeições pendentes por macro além da primeira que
 *   tiver item compatível — se ela não bastar (teto de variação), o resto
 *   fica em `saldoNaoAbsorvido`, não continua procurando na seguinte.
 * Os dois são simplificações conscientes: cobrem o caso comum (sobrou
 * carbo, a próxima refeição com carbo absorve) sem a complexidade de um
 * solver completo. Evoluir para múltiplos itens/refeições é trabalho
 * separado, se a experiência mostrar que faz falta.
 */
import { normalizeFoodKey } from './learned-foods'
import { classifyFood, macrosPer100g, type FoodClass } from './foodSwap'
import type { PlanMeal, PlanItem, MacroTotals } from './dietPlanShape'

export type MacroAjustavel = 'protein' | 'carbs' | 'fat'

export interface AjusteAplicado {
  refeicao: string
  alimento: string
  macro: MacroAjustavel
  /** Quanto daquele macro (em gramas) foi acrescentado (positivo) ou retirado (negativo). */
  deltaG: number
}

export interface ResultadoAjusteDoDia {
  /** Todas as refeições do dia, na mesma ordem de entrada. As já lançadas
   *  vêm IDÊNTICAS à entrada; só as ainda-não-lançadas podem ter items
   *  diferentes. */
  refeicoes: PlanMeal[]
  ajustes: AjusteAplicado[]
  /** O que sobrou sem nenhuma refeição pendente capaz de absorver — em
   *  gramas do macro. Ausente/zero quando tudo foi absorvido. */
  saldoNaoAbsorvido: Partial<Record<MacroAjustavel, number>>
}

/** Abaixo disto é ruído de arredondamento, não desvio real. */
const PISO_RELEVANCIA_G = 1

/**
 * Teto de quanto um item pode encolher/crescer para absorver a diferença.
 * Mesma lógica de bom senso do resto do app (autoload trava salto de sessão,
 * foodSwap recusa porção que encosta no clamp): sem teto, um dia sem
 * registrar nada faria o item seguinte virar uma montanha de comida —
 * prato impossível de fato existir.
 */
const FATOR_MIN = 0.5
const FATOR_MAX = 1.6

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

const round = (n: number): number => Math.round(n * 10) / 10

function macroKeyDaClasse(classe: FoodClass): MacroAjustavel | null {
  if (classe === 'protein') return 'protein'
  if (classe === 'carb') return 'carbs'
  if (classe === 'fat') return 'fat'
  return null
}

/** Escala TODOS os macros do item proporcionalmente — o papel dele no prato não muda. */
function escalarItem(item: PlanItem, fator: number): PlanItem {
  return {
    food: item.food,
    grams: Math.round(num(item.grams) * fator),
    calories: Math.round(num(item.calories) * fator),
    protein: round(num(item.protein) * fator),
    carbs: round(num(item.carbs) * fator),
    fat: round(num(item.fat) * fator),
  }
}

function somarTotals(items: PlanItem[]): MacroTotals {
  return items.reduce<MacroTotals>(
    (acc, it) => ({
      calories: acc.calories + num(it.calories),
      protein: acc.protein + num(it.protein),
      carbs: acc.carbs + num(it.carbs),
      fat: acc.fat + num(it.fat),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  )
}

/**
 * Tenta fazer UM item absorver `saldoDisponivel` gramas do macro. Devolve o
 * item ajustado (dentro do teto) e quanto de fato foi absorvido — que pode
 * ser menor que o pedido, se o teto travar antes.
 */
function absorverNoItem(item: PlanItem, macro: MacroAjustavel, saldoDisponivel: number): { item: PlanItem; absorvido: number } {
  const grams = num(item.grams)
  const macroAtual = num(item[macro])
  if (grams <= 0 || macroAtual <= 0) return { item, absorvido: 0 }

  const macroPor100g = (macroAtual / grams) * 100
  if (macroPor100g <= 0) return { item, absorvido: 0 }

  const gramasNecessarios = (saldoDisponivel * 100) / macroPor100g
  const novoGramsBruto = grams + gramasNecessarios
  const fator = Math.min(FATOR_MAX, Math.max(FATOR_MIN, novoGramsBruto / grams))

  const itemAjustado = escalarItem(item, fator)
  const absorvido = num(itemAjustado[macro]) - macroAtual
  return { item: itemAjustado, absorvido }
}

/**
 * Reajusta as refeições do dia ainda não lançadas, dado o que já foi
 * lançado. `lancamentosPorNome` é chaveado por `normalizeFoodKey(nome da
 * refeição)` — quem chama monta esse mapa a partir do diário do dia.
 */
export function ajustarDia(refeicoesDoDia: PlanMeal[], lancamentosPorNome: Map<string, MacroTotals>): ResultadoAjusteDoDia {
  const saldo: Record<MacroAjustavel, number> = { protein: 0, carbs: 0, fat: 0 }
  const indicesPendentes: number[] = []
  const refeicoes = refeicoesDoDia.map((r) => r)

  refeicoesDoDia.forEach((refeicao, idx) => {
    const lancado = lancamentosPorNome.get(normalizeFoodKey(refeicao.name))
    if (lancado) {
      saldo.protein += num(refeicao.totals.protein) - num(lancado.protein)
      saldo.carbs += num(refeicao.totals.carbs) - num(lancado.carbs)
      saldo.fat += num(refeicao.totals.fat) - num(lancado.fat)
    } else {
      indicesPendentes.push(idx)
    }
  })

  const ajustes: AjusteAplicado[] = []
  const macros: MacroAjustavel[] = ['carbs', 'protein', 'fat']

  for (const macro of macros) {
    if (Math.abs(saldo[macro]) < PISO_RELEVANCIA_G) continue

    for (const idx of indicesPendentes) {
      if (Math.abs(saldo[macro]) < PISO_RELEVANCIA_G) break
      const refeicao = refeicoes[idx]
      const itemIdx = refeicao.items.findIndex((it) => macroKeyDaClasse(classifyFood(macrosPer100g(it))) === macro)
      if (itemIdx === -1) continue

      const item = refeicao.items[itemIdx]
      const { item: itemAjustado, absorvido } = absorverNoItem(item, macro, saldo[macro])
      if (Math.abs(absorvido) < PISO_RELEVANCIA_G) continue

      const novosItems = refeicao.items.slice()
      novosItems[itemIdx] = itemAjustado
      refeicoes[idx] = { ...refeicao, items: novosItems, totals: somarTotals(novosItems) }

      saldo[macro] -= absorvido
      ajustes.push({ refeicao: refeicao.name, alimento: item.food, macro, deltaG: round(absorvido) })
      // Só o PRIMEIRO item compatível por refeição, de propósito (ver cabeçalho).
      break
    }
  }

  const saldoNaoAbsorvido: Partial<Record<MacroAjustavel, number>> = {}
  for (const macro of macros) {
    if (Math.abs(saldo[macro]) >= PISO_RELEVANCIA_G) saldoNaoAbsorvido[macro] = round(saldo[macro])
  }

  return { refeicoes, ajustes, saldoNaoAbsorvido }
}
