import type { SupabaseClient } from '@supabase/supabase-js'
import type { FoodItem } from '../food-database'

type TacoRow = {
  food_key: string
  name: string
  aliases: string[]
  kcal_per_100g: number
  protein: number
  carbs: number
  fat: number
  fiber: number | null
}

/** Assinatura dos quatro macros, para comparar se dois alimentos "são o mesmo número". */
function macroSignature(item: FoodItem): string {
  // 1 casa decimal: a TACO já vem com ruído de arredondamento na 2ª casa (ex.:
  // 153.77 vs 153.8), e comparar cru faria duas linhas IDÊNTICAS na prática
  // (mesmo food_key reaparecendo por acaso, ou dado duplicado) parecerem
  // divergentes por 0.01 kcal.
  return `${item.kcal.toFixed(1)}|${item.p.toFixed(1)}|${item.c.toFixed(1)}|${item.f.toFixed(1)}`
}

/**
 * Load all TACO foods from Supabase as a FoodItem map.
 * Keys include both food_key and all aliases for parser compatibility.
 * Returns {} on error — non-critical, parser falls back to OFF/Gemini.
 *
 * ── Por que existe uma política de conflito aqui (medido em 02/09/2026) ────
 *
 * O alias é MUITAS-PARA-UM: "arroz" está em 7 linhas da TACO (carreteiro,
 * integral cru/cozido, tipo 1 cru/cozido, tipo 2 cru/cozido), "carne" em 60,
 * "frango" em 25. A versão antiga escrevia essas linhas num objeto sem
 * `ORDER BY` — o alias virava a ÚLTIMA linha da ORDEM FÍSICA da tabela, não
 * uma decisão. Foi assim que "arroz" passou a significar "Arroz carreteiro"
 * (153,77 kcal · P10,83 · C11,58 · G7,12 por 100 g) e "250g arroz branco" saiu
 * do parser com 384 kcal · P27 C29 G18 na tela do dono — quase o TRIPLO da
 * proteína do arroz branco de verdade, e nada nisso avisava o erro: 384 kcal
 * para 250 g de arroz é um número plausível, então ninguém confere o que
 * parece certo. E como não havia `ORDER BY`, um `VACUUM FULL` ou uma recarga
 * da TACO podia trocar o significado de "arroz" de novo, em silêncio — o
 * defeito era instável, não só errado.
 *
 * A correção tem duas partes:
 *  1. `ORDER BY food_key` — determinismo. O resultado não depende mais da
 *     ordem física da tabela.
 *  2. Política explícita: `food_key` (o nome completo, ex. "arroz-carreteiro")
 *     SEMPRE vira chave — ele é 1-para-1 por definição. Um ALIAS só vira chave
 *     quando toda linha que o reivindica tem os MESMOS quatro macros (linhas
 *     genuinamente duplicadas). Alias reivindicado por linhas com macros
 *     DIFERENTES (ex. "arroz" apontando ora para 128 kcal, ora para 154, ora
 *     para 358) é DESCARTADO — não sobrevive nem com o valor da primeira nem
 *     da última linha.
 *
 * Por que descartar em vez de "pegar a mais comum" ou "a mais barata": não há
 * como a MÁQUINA saber qual das 60 carnes ou dos 25 frangos é "o" alimento que
 * a palavra sozinha deveria significar — isso é curadoria, não agregação, e
 * curadoria errada aqui já produziu um número plausível e ERRADO, que é pior
 * que reconhecer a ambiguidade: ninguém confere um valor que parece razoável.
 * O caminho de fallback é o cascateamento que `food-resolver.ts` já tem —
 * um alias descartado vira `unknownLine` e segue para a IA (Gemini), que lê o
 * resto da frase para desambiguar. Os termos genéricos de alto volume (arroz,
 * carne, frango, leite, batata…) não pagam esse custo: `food-database.ts` os
 * cura um a um com o "sentido genérico e mais comum" em português brasileiro,
 * e a fase 1a do resolvedor (base curada, sem TACO) resolve ANTES de esta
 * função sequer ser chamada — então a curadoria vale mais do que esta função
 * sozinha poderia decidir.
 */
export async function loadTacoFoods(supabase: SupabaseClient): Promise<Record<string, FoodItem>> {
  try {
    const { data, error } = await supabase
      .from('foods_taco')
      .select('food_key, name, aliases, kcal_per_100g, protein, carbs, fat, fiber')

    if (error || !data) return {}

    // Ordena no CLIENTE, não no `.order()` do Postgrest — o determinismo (a
    // parte que importa aqui) não depende de o servidor devolver em ordem
    // nenhuma: com o `food_key` como critério de desempate abaixo, a saída é
    // sempre a mesma não importa em que ordem `data` chegou.
    const rows = (data as TacoRow[]).slice().sort((a, b) => String(a.food_key).localeCompare(String(b.food_key)))

    // Passada 1: para cada alias, junta o CONJUNTO de assinaturas de macro que o
    // reivindicam. `food_key` nunca entra aqui — ele não compete com ninguém.
    const aliasSignatures = new Map<string, Set<string>>()
    for (const row of rows) {
      const item: FoodItem = {
        kcal: Number(row.kcal_per_100g) || 0,
        p: Number(row.protein) || 0,
        c: Number(row.carbs) || 0,
        f: Number(row.fat) || 0,
      }
      const sig = macroSignature(item)
      const aliases = Array.isArray(row.aliases) ? row.aliases : []
      for (const alias of aliases) {
        const a = String(alias || '').trim().toLowerCase()
        if (!a) continue
        if (!aliasSignatures.has(a)) aliasSignatures.set(a, new Set())
        aliasSignatures.get(a)!.add(sig)
      }
    }

    // Passada 2: escreve. `food_key` sempre. Alias só se a assinatura for única
    // entre quem o reivindica (inclui o caso raro de duas linhas idênticas).
    const result: Record<string, FoodItem> = {}
    for (const row of rows) {
      const key = String(row.food_key || '').trim()
      if (!key) continue

      const item: FoodItem = {
        kcal: Number(row.kcal_per_100g) || 0,
        p: Number(row.protein) || 0,
        c: Number(row.carbs) || 0,
        f: Number(row.fat) || 0,
      }

      result[key] = item

      const aliases = Array.isArray(row.aliases) ? row.aliases : []
      for (const alias of aliases) {
        const a = String(alias || '').trim().toLowerCase()
        if (!a) continue
        const sigs = aliasSignatures.get(a)
        if (sigs && sigs.size === 1) result[a] = item
      }
    }

    return result
  } catch {
    return {}
  }
}
