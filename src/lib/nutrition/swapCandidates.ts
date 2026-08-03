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
import type { SwapCandidate } from './foodSwap'

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

/** Alimento sem caloria nenhuma não serve de substituto — não dá pra dimensionar porção. */
const usable = (c: SwapCandidate): boolean => c.kcal > 0 || c.protein > 0 || c.carbs > 0 || c.fat > 0

/** A base curada como candidatos. Pura — dá pra testar sem banco. */
export function databaseCandidates(): SwapCandidate[] {
  return Object.entries(foodDatabase)
    .map(([name, item]) => ({
      name,
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

  return mergeCandidates(learned, custom, databaseCandidates())
}
