/**
 * MEMO DE REFEIÇÃO — o que a IA já estimou uma vez, pra não pagar de novo.
 *
 * ── Por que "memo" e não "alimento aprendido" ─────────────────────────────────
 * A IA estima REFEIÇÕES, não alimentos: o prompt manda "Some tudo e retorne um
 * único objeto" (aiEstimate.ts), então o que volta é o total do que o usuário
 * descreveu — "200g arroz, 100g feijão e 200g bife" → 1330 kcal.
 *
 * O código antigo gravava esse TOTAL nas colunas `*_per_100g` e devolvia as linhas
 * ao parser como se fossem alimentos por 100g, que ele multiplicava por grams/100.
 * Erro de categoria, e o JSDoc antigo até avisava ("Total calories of the meal (not
 * per 100g)") logo acima do `kcal_per_100g: Math.round(totalCalories)`.
 *
 * Em produção isso deixou 41 linhas com média de 629 kcal/100g e máximo de 1650 —
 * gordura pura tem 900, então nada comestível chega lá. Não eram erros de estimativa:
 * eram totais de refeição na coluna errada.
 *
 * O que salvou os usuários foi um segundo bug: a chave é o texto CRU digitado
 * ("200g arroz 100g feijao...") e o parser tira os números antes de comparar, então
 * 40 das 41 linhas nunca casaram com nada. O recurso gastava uma chamada de Gemini e
 * uma linha por refeição desconhecida — e nunca entregava. As que casavam (texto sem
 * número, tipo "sushi") entregavam o total dividido por 2, porque o parser assumia
 * 50g.
 *
 * ── O desenho agora ───────────────────────────────────────────────────────────
 * Chave = texto digitado. Valor = total daquela refeição. Isso é EXATAMENTE o que já
 * estava gravado — o dado nunca foi lixo, as colunas é que têm nome errado (renomear
 * exige migration; ficam documentadas aqui). Então o memo é consultado por
 * IGUALDADE do texto inteiro e devolve os totais DIRETO, sem multiplicar por
 * grama nenhuma. Some o veneno e as 41 linhas viram úteis.
 *
 * Consequência boa: "mesma refeição de sempre" passa a responder na hora, de graça e
 * sempre igual — que era a promessa original do recurso.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { MealLog } from './engine'

/**
 * Normaliza o texto pra virar chave. Precisa ser idêntica na escrita e na leitura,
 * senão o memo nunca casa.
 */
export function normalizeFoodKey(name: string): string {
  return (name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** Teto de memos por usuário. */
const MAX_MEMOS_PER_USER = 200

export interface MealMemo extends MealLog {
  /** A chave que casou — pra contabilizar o uso. */
  foodKey: string
}

/**
 * Busca o memo do texto EXATO. Consulta indexada (user_id, food_key) — nada de
 * carregar 500 linhas pra procurar no cliente, como a versão antiga fazia.
 *
 * ATENÇÃO às colunas: `kcal_per_100g` & cia guardam o TOTAL da refeição, não valores
 * por 100g (ver o cabeçalho). O nome mente; o conteúdo é total.
 */
export async function loadMealMemo(
  supabase: SupabaseClient,
  userId: string,
  text: string,
): Promise<MealMemo | null> {
  try {
    const foodKey = normalizeFoodKey(text)
    if (!foodKey || foodKey.length < 2) return null

    const { data, error } = await supabase
      .from('nutrition_learned_foods')
      .select('food_key, display_name, kcal_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g')
      .eq('user_id', userId)
      .eq('food_key', foodKey)
      .maybeSingle()

    if (error || !data) return null

    const calories = Number(data.kcal_per_100g) || 0
    const protein = Number(data.protein_per_100g) || 0
    const carbs = Number(data.carbs_per_100g) || 0
    const fat = Number(data.fat_per_100g) || 0

    // Memo vazio não é resposta — deixa a cascata seguir em vez de gravar 0 kcal.
    if (calories <= 0 && protein <= 0) return null

    return {
      foodKey: String(data.food_key || ''),
      foodName: String(data.display_name || 'Refeição'),
      calories,
      protein,
      carbs,
      fat,
    }
  } catch {
    return null
  }
}

/**
 * Guarda o que a IA estimou pra este texto. Os valores são os TOTAIS da refeição —
 * é o que o memo precisa (ver o cabeçalho), e é o que as colunas já guardavam.
 */
export async function saveMealMemo(
  supabase: SupabaseClient,
  userId: string,
  originalInput: string,
  foodName: string,
  totalCalories: number,
  totalProtein: number,
  totalCarbs: number,
  totalFat: number,
): Promise<void> {
  try {
    const foodKey = normalizeFoodKey(originalInput)
    if (!foodKey || foodKey.length < 2) return

    // Não guarda refeição vazia: viraria um memo que responde 0 kcal pra sempre.
    if (!(Number(totalCalories) > 0) && !(Number(totalProtein) > 0)) return

    const { count, error: countError } = await supabase
      .from('nutrition_learned_foods')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
    if (countError) return
    if ((count ?? 0) >= MAX_MEMOS_PER_USER) return // teto silencioso

    const safeName = String(foodName || originalInput).trim()
      .replace(/<[^>]*>/g, '')
      .replace(/[\x00-\x1F\x7F]/g, '')
      .slice(0, 120)

    await supabase
      .from('nutrition_learned_foods')
      .upsert(
        {
          user_id: userId,
          food_key: foodKey,
          display_name: safeName || 'Refeição',
          kcal_per_100g: Math.round(Number(totalCalories) || 0),
          protein_per_100g: Math.round(Number(totalProtein) || 0),
          carbs_per_100g: Math.round(Number(totalCarbs) || 0),
          fat_per_100g: Math.round(Number(totalFat) || 0),
          source: 'ai',
          // `use_count` fica FORA de propósito: a coluna tem default 1, então o
          // insert nasce em 1 e o update não mexe. Mandá-lo aqui zerava o contador a
          // cada re-estimativa e fazia o bump não valer nada.
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,food_key' },
      )
  } catch {
    // Não-crítico — não pode quebrar o lançamento.
  }
}

/** Conta o acerto do memo. Best-effort. */
export async function bumpMealMemoUsage(
  supabase: SupabaseClient,
  userId: string,
  foodKey: string,
): Promise<void> {
  try {
    await supabase.rpc('increment_learned_food_usage', {
      p_user_id: userId,
      p_food_key: foodKey,
    })
  } catch {
    // Best-effort — ignora falha.
  }
}
