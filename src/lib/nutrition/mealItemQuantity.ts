/**
 * Editar a QUANTIDADE de um item já lançado — sem re-resolver o alimento.
 *
 * Até esta tarefa, o editor de refeição (`NutritionEntryCard`) só sabia
 * REMOVER e ADICIONAR item: "250g arroz" lançado por engano virava perder o
 * item inteiro e relançar. `editEntryCore` (`mutations.ts`) já regrava
 * `items` inteiro e recalcula os totais como SOMA dos itens — zero mudança de
 * servidor. Faltava só a UI e este núcleo puro.
 *
 * Regra de produto (decidida, não reabrir): edita-se **apenas a quantidade**,
 * com recálculo proporcional dos macros. Nome e macros continuam intocáveis
 * por aqui — trocar "arroz" por "batata doce" mantendo os macros do arroz
 * grava dado mentiroso, e macro digitado à mão contamina o repertório de
 * troca de alimento (`mealItemFoods.ts` deriva densidade de `items`). Trocar
 * alimento continua sendo REMOVER + ADICIONAR, que já existe e passa pela
 * cascata do parser/IA.
 *
 * Duas origens de item, e só uma tem quantidade no TEXTO:
 *  - **parser local**: o `label` é a linha crua que o usuário digitou, com a
 *    quantidade na frente ("250g arroz branco", "2 ovos", "500ml leite zero
 *    lactose"). Reescalar reescreve o NÚMERO na frente do rótulo.
 *  - **IA**: o `label` é o nome limpo, SEM quantidade ("arroz branco cozido").
 *    A quantidade mora só em `grams`; o rótulo não muda ao reescalar —
 *    `rotuloItem` (`dayMeals.ts`) já sabe prefixar gramas quando o texto não
 *    começa com dígito, então o card exibe a quantidade certa de qualquer jeito.
 *
 * Duas formas de item NÃO têm densidade (`grams: 0`): memo do resolvedor e o
 * item legado semeado para refeição antiga sem detalhamento. Para essas,
 * `quantidadeEditavel` devolve `null` — não existe base para reescalar, e
 * inventar 100g seria afirmar uma medição que ninguém fez (mesmo motivo pelo
 * qual `rotuloItem` se recusa a prefixar gramas quando `grams <= 0`).
 *
 * ⚠️ **Reescale SEMPRE a partir do item ORIGINAL, nunca do já reescalado.**
 * Encadear (250→150, depois 150→250) acumula arredondamento e não volta ao
 * valor exato. Quem chama este módulo (`NutritionEntryCard`) guarda os itens
 * como estavam ao ABRIR o editor (`itensOriginais`) e sempre reescala a
 * partir deles — nunca do item já editado na tela.
 */

import type { MealItem } from './engine'

export type QuantidadeDoItem = {
  valor: number
  unidade: string
  origem: 'rotulo' | 'grams'
}

/** Teto de sanidade: acima disso é erro de digitação, não refeição real. */
export const QUANTIDADE_MAXIMA = 5000

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Uma casa decimal quando precisa, inteiro quando dá — sem zeros à toa. */
function formatarNumero(v: number): string {
  const arredondado = Math.round(v * 100) / 100
  return String(arredondado)
}

/**
 * Unidades "aproximadas" que o parser reconhece na frente de uma linha
 * (`parser.ts`, `approxRegex`). Duplicado de propósito: este módulo não
 * importa de `parser.ts` — outra frente trabalha nele em paralelo — e aqui só
 * precisamos RECONHECER o token para reescrever a quantidade, nunca decidir
 * gramagem (isso é trabalho do parser, na hora de lançar).
 */
const UNIDADES_APROXIMADAS = [
  'colher(?:es)?', 'conchas?', 'bifes?', 'fatias?', 'pedacos?', 'latas?',
  'scoops?', 'doses?', 'unidades?', 'unid', 'un', 'xicaras?', 'copos?',
  'pratos?', 'rodelas?', 'espigas?', 'postas?', 'medalh(?:ao|oes)?', 'espetinhos?',
]

const REGEX_GRAMATURA = /^(\d+(?:[.,]\d+)?)(\s*)(kg|gr|ml|g|l)\b/i
const REGEX_APROXIMADA = new RegExp(`^(\\d+(?:[.,]\\d+)?)(\\s*)(${UNIDADES_APROXIMADAS.join('|')})\\b`, 'i')
/** Contagem pura, sem unidade explícita: "2 ovos", "1 esfirra de frango…". */
const REGEX_CONTAGEM = /^(\d+(?:[.,]\d+)?)(\s+)(?=\S)/

/**
 * Lê a quantidade da FRENTE de um rótulo: `"250g arroz branco"` →
 * `{ valor: 250, unidade: "g", resto: " arroz branco" }`.
 *
 * `unidade` carrega tudo que separava o número do resto do texto (o espaço
 * incluso quando havia um) — não é para EXIBIR, é para
 * `escreverQuantidadeNoRotulo` reconstruir o rótulo caractere a caractere sem
 * perder formatação (`unidade + resto` reconstrói exatamente o que vinha
 * depois do número, porque as duas fatias particionam o mesmo trecho).
 *
 * `null` quando o rótulo não COMEÇA com uma quantidade reconhecível — é o
 * caso dos itens da IA ("arroz branco cozido", sem número na frente) e de
 * qualquer texto livre.
 */
export function lerQuantidadeDoRotulo(label: string): { valor: number; unidade: string; resto: string } | null {
  const texto = String(label ?? '')
  for (const regex of [REGEX_GRAMATURA, REGEX_APROXIMADA, REGEX_CONTAGEM]) {
    const m = texto.match(regex)
    if (!m) continue
    const valor = Number(String(m[1] || '0').replace(',', '.'))
    if (!(valor > 0)) return null
    return { valor, unidade: m[0].slice(m[1].length), resto: texto.slice(m[0].length) }
  }
  return null
}

/**
 * Reescreve SÓ o número na frente do rótulo, preservando unidade e o resto —
 * inclusive sufixo de preparo ("200g frango · à milanesa" → "100g frango · à
 * milanesa", ver `parser.ts` sobre por que o preparo entra no label). Rótulo
 * sem quantidade reconhecível volta INTACTO — quem chama decide o que fazer.
 */
export function escreverQuantidadeNoRotulo(label: string, novoValor: number): string {
  const lido = lerQuantidadeDoRotulo(label)
  if (!lido) return String(label ?? '')
  return `${formatarNumero(novoValor)}${lido.unidade}${lido.resto}`
}

/**
 * A quantidade editável de um item, ou `null` quando não há densidade
 * conhecida (`grams <= 0` — itens de memo/legado; ver cabeçalho do arquivo).
 */
export function quantidadeEditavel(item: MealItem | null | undefined): QuantidadeDoItem | null {
  if (!item || !(num(item.grams) > 0)) return null
  const doRotulo = lerQuantidadeDoRotulo(item.label)
  if (doRotulo) return { valor: doRotulo.valor, unidade: doRotulo.unidade, origem: 'rotulo' }
  return { valor: num(item.grams), unidade: 'g', origem: 'grams' }
}

/**
 * Reescala um item para uma NOVA quantidade, a partir do item passado (que
 * deve ser sempre o ORIGINAL — ver aviso no cabeçalho do arquivo).
 *
 * `novoValor <= 0` (ou não numérico) devolve o item INTACTO: quem remove um
 * item é o botão `X`; campo em branco durante a digitação não pode zerar a
 * refeição. Item sem densidade (`quantidadeEditavel` devolve `null`) também
 * volta intacto — sem base, `fator = novoValor/0` daria `Infinity`.
 */
export function reescalarItem(item: MealItem, novoValor: number): MealItem {
  const quantidade = quantidadeEditavel(item)
  if (!quantidade) return item
  if (!Number.isFinite(novoValor) || novoValor <= 0) return item
  const alvo = Math.min(novoValor, QUANTIDADE_MAXIMA)
  const fatorDeEscala = alvo / quantidade.valor
  if (!Number.isFinite(fatorDeEscala) || fatorDeEscala <= 0) return item
  const novoLabel = quantidade.origem === 'rotulo' ? escreverQuantidadeNoRotulo(item.label, alvo) : item.label
  return {
    label: novoLabel,
    grams: Math.round(num(item.grams) * fatorDeEscala),
    calories: Math.round(num(item.calories) * fatorDeEscala),
    protein: Math.round(num(item.protein) * fatorDeEscala),
    carbs: Math.round(num(item.carbs) * fatorDeEscala),
    fat: Math.round(num(item.fat) * fatorDeEscala),
  }
}
