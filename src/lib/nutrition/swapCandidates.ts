/**
 * swapCandidates — monta a lista de substitutos possíveis para a troca de alimento.
 *
 * Três fontes, nesta ordem de prioridade (a ordenação final é do `swapFood`):
 *   1. `nutrition_learned_foods` — o que o usuário JÁ come, com macros por 100 g
 *      medidos do uso real. É o que faz a sugestão parecer dele, não de um app.
 *   2. `nutrition_custom_foods`  — alimentos que ele cadastrou na mão (rótulo/código).
 *   3. `foodDatabase` (TACO/USDA) — 140 itens curados, a rede de segurança para quem
 *      ainda não tem repertório. Sem ela, usuário novo apertaria "trocar" e não
 *      aconteceria nada — em 03/08/2026 dois dos três usuários com histórico tinham
 *      só 3 alimentos aprendidos.
 *
 * Falha de leitura degrada para lista parcial (mesma postura do buildFoodProfile):
 * trocar com menos opções é melhor do que não trocar.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { foodDatabase } from './food-database'
import { normalizeFoodKey } from './learned-foods'
import { isUsableAsSwapCandidate } from './foodItemSanity'
import { buildMealItemFoods } from './mealItemFoods'
import type { SwapCandidate } from './foodSwap'

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

/**
 * Quem pode ser oferecido como substituto. Ver `foodItemSanity`: o repertório
 * aprendido é cheio de REFEIÇÃO inteira ("Refeição de Arroz, Strogonoff e Batata
 * Palha", 1070 kcal/100 g), de composto ("Pão Francês com Doce de Leite" — 125 g
 * de quê?) e de quantidade no nome ("50g de Whey Protein"). Nada disso serve.
 */
const usable = (c: SwapCandidate): boolean => isUsableAsSwapCandidate(c)

/**
 * Como o alimento da base curada é ESCRITO na tela.
 *
 * As chaves são normalizadas para casar o texto digitado (`file mignon`), e isso
 * chegou à interface no dia em que o card do plano passou a exibir o nome do
 * candidato: a opção saía "file mignon", em minúsculas e sem acento. O `label`
 * cobre onde a chave mente sobre a grafia; para o resto basta a maiúscula.
 */
export function nomeExibidoDaBase(chave: string, item?: { label?: string }): string {
  const label = String(item?.label ?? '').trim()
  if (label) return label
  const nome = String(chave ?? '').trim()
  return nome ? nome.charAt(0).toUpperCase() + nome.slice(1) : nome
}

/** A base curada como candidatos. Pura — dá pra testar sem banco. */
export function databaseCandidates(): SwapCandidate[] {
  return Object.entries(foodDatabase)
    .map(([name, item]) => ({
      name: nomeExibidoDaBase(name, item),
      kcal: num(item?.kcal),
      protein: num(item?.p),
      carbs: num(item?.c),
      fat: num(item?.f),
      source: 'database' as const,
    }))
    .filter(usable)
}

/**
 * Junta as três fontes, sem repetir alimento: a primeira ocorrência vence, e como
 * `learned` entra antes, o macro medido do usuário ganha do valor da tabela curada.
 */
export function mergeCandidates(...groups: SwapCandidate[][]): SwapCandidate[] {
  const byKey = new Map<string, SwapCandidate>()
  for (const group of groups) {
    for (const c of Array.isArray(group) ? group : []) {
      const key = normalizeFoodKey(String(c?.name ?? ''))
      if (!key || key.length < 2) continue
      if (byKey.has(key)) continue
      if (!usable(c)) continue
      byKey.set(key, c)
    }
  }
  return [...byKey.values()]
}

/** Lê as fontes do usuário e devolve tudo pronto pro `swapFood`. */
export async function buildSwapCandidates(supabase: SupabaseClient, userId: string): Promise<SwapCandidate[]> {
  const uid = String(userId || '').trim()
  if (!uid) return databaseCandidates()

  // FONTE PRIMÁRIA do repertório: os ITENS das refeições lançadas, não a tabela de
  // "alimentos aprendidos". Medido em 03/08/2026: dos 42 aprendidos da conta do dono,
  // 1 servia como substituto — o resto era refeição inteira, composto ou trazia a
  // quantidade no nome. Ver mealItemFoods.
  const mealFoods = await buildMealItemFoods(supabase, uid)

  let learned: SwapCandidate[] = []
  try {
    const { data } = await supabase
      .from('nutrition_learned_foods')
      .select('display_name, food_key, kcal_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g')
      .eq('user_id', uid)
      .order('use_count', { ascending: false })
      .limit(100)
    learned = (Array.isArray(data) ? data : [])
      .filter(isRecord)
      .map((r) => ({
        name: String(r.display_name || r.food_key || '').trim().slice(0, 80),
        kcal: num(r.kcal_per_100g),
        protein: num(r.protein_per_100g),
        carbs: num(r.carbs_per_100g),
        fat: num(r.fat_per_100g),
        source: 'learned' as const,
      }))
      .filter((c) => c.name)
  } catch {
    // lista parcial é aceitável — ver cabeçalho
  }

  let custom: SwapCandidate[] = []
  try {
    const { data } = await supabase
      .from('nutrition_custom_foods')
      .select('name, kcal_per100g, protein_per100g, carbs_per100g, fat_per100g')
      .eq('user_id', uid)
      .limit(100)
    custom = (Array.isArray(data) ? data : [])
      .filter(isRecord)
      .map((r) => ({
        name: String(r.name || '').trim().slice(0, 80),
        kcal: num(r.kcal_per100g),
        protein: num(r.protein_per100g),
        carbs: num(r.carbs_per100g),
        fat: num(r.fat_per100g),
        source: 'custom' as const,
      }))
      .filter((c) => c.name)
  } catch {
    // idem
  }

  // Ordem = precedência: item de refeição real primeiro (nome limpo e macros
  // derivados de gramas de verdade), depois o cadastrado à mão, depois o aprendido
  // (quase sempre vazio após o crivo), e a base curada como rede de segurança.
  return mergeCandidates(mealFoods, custom, learned, databaseCandidates())
}
