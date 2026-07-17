import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadMealMemo, saveMealMemo, normalizeFoodKey } from '../learned-foods'

/**
 * MEMO DE REFEIÇÃO — o que a IA já estimou, pra não pagar de novo.
 *
 * O código antigo gravava o TOTAL da refeição nas colunas `*_per_100g` e devolvia as
 * linhas ao parser como alimentos por 100g, que ele multiplicava por grams/100. Em
 * produção: 41 linhas, média 629 kcal/100g, máximo 1650 — gordura pura tem 900.
 *
 * O memo consulta por igualdade do texto e devolve os totais DIRETO, sem multiplicar.
 */

const memoRow = {
  food_key: '200g arroz 100g feijao 200g bife na chapa',
  display_name: 'Arroz, feijão e bife',
  kcal_per_100g: 1330, // é o TOTAL da refeição — a coluna é que tem nome errado
  protein_per_100g: 118,
  carbs_per_100g: 90,
  fat_per_100g: 50,
}

function mockSupabase(row: Record<string, unknown> | null) {
  const eq2 = { maybeSingle: () => Promise.resolve({ data: row, error: null }) }
  const eq1 = { eq: () => eq2 }
  return {
    from: () => ({ select: () => ({ eq: () => eq1 }) }),
    rpc: () => Promise.resolve({ data: null, error: null }),
  } as unknown as SupabaseClient
}

describe('loadMealMemo — devolve o TOTAL, sem multiplicar', () => {
  it('a refeição volta com os macros que a IA estimou, intactos', async () => {
    const memo = await loadMealMemo(mockSupabase(memoRow), 'u1', '200g arroz, 100g feijao, 200g bife na chapa')
    expect(memo).not.toBeNull()
    expect(memo!.calories).toBe(1330) // NÃO 1330 × algum peso / 100
    expect(memo!.protein).toBe(118)
    expect(memo!.foodName).toBe('Arroz, feijão e bife')
  })

  it('texto diferente não casa (é memo de refeição exata, não de alimento)', async () => {
    const memo = await loadMealMemo(mockSupabase(null), 'u1', 'outra coisa')
    expect(memo).toBeNull()
  })

  it('memo zerado não responde — deixa a cascata seguir', async () => {
    const memo = await loadMealMemo(
      mockSupabase({ ...memoRow, kcal_per_100g: 0, protein_per_100g: 0 }),
      'u1',
      'x',
    )
    expect(memo).toBeNull()
  })

  it('texto curto demais nem consulta o banco', async () => {
    const from = vi.fn()
    const memo = await loadMealMemo({ from } as unknown as SupabaseClient, 'u1', 'a')
    expect(memo).toBeNull()
    expect(from).not.toHaveBeenCalled()
  })

  it('erro do banco não quebra o lançamento', async () => {
    const supa = { from: () => { throw new Error('boom') } } as unknown as SupabaseClient
    await expect(loadMealMemo(supa, 'u1', 'arroz e feijao')).resolves.toBeNull()
  })
})

describe('a chave sobrevive à forma como o usuário digita', () => {
  it('acento, caixa e pontuação normalizam igual', () => {
    expect(normalizeFoodKey('Arroz, Feijão e Bife!')).toBe(normalizeFoodKey('arroz feijao e bife'))
    expect(normalizeFoodKey('  PÃO   de   Queijo  ')).toBe('pao de queijo')
  })

  it('a chave preserva o número (o memo é da refeição EXATA)', () => {
    // "200g de arroz" e "300g de arroz" são memos diferentes, de propósito.
    expect(normalizeFoodKey('200g de arroz')).not.toBe(normalizeFoodKey('300g de arroz'))
  })
})

describe('saveMealMemo', () => {
  const spyUpsert = () => {
    const upsert = vi.fn(() => Promise.resolve({ error: null }))
    const supa = {
      from: () => ({
        select: () => ({ eq: () => Promise.resolve({ count: 0, error: null }) }),
        upsert,
      }),
    } as unknown as SupabaseClient
    return { supa, upsert }
  }

  it('grava os totais sob a chave do texto digitado', async () => {
    const { supa, upsert } = spyUpsert()
    await saveMealMemo(supa, 'u1', '1 lata de leite moça de 395g', 'Leite condensado', 1285, 30, 220, 35)
    expect(upsert).toHaveBeenCalledOnce()
    const payload = upsert.mock.calls[0][0] as Record<string, unknown>
    expect(payload.food_key).toBe('1 lata de leite moca de 395g')
    expect(payload.kcal_per_100g).toBe(1285)
  })

  it('NÃO manda use_count — mandá-lo zerava o contador a cada re-estimativa', async () => {
    const { supa, upsert } = spyUpsert()
    await saveMealMemo(supa, 'u1', 'sushi', 'Sushi', 500, 20, 60, 15)
    const payload = upsert.mock.calls[0][0] as Record<string, unknown>
    expect(payload).not.toHaveProperty('use_count') // a coluna tem default 1
  })

  it('não grava refeição vazia (viraria um memo que responde 0 kcal pra sempre)', async () => {
    const { supa, upsert } = spyUpsert()
    await saveMealMemo(supa, 'u1', 'nada', 'Nada', 0, 0, 0, 0)
    expect(upsert).not.toHaveBeenCalled()
  })

  it('respeita o teto de 200 memos por usuário', async () => {
    const upsert = vi.fn()
    const supa = {
      from: () => ({
        select: () => ({ eq: () => Promise.resolve({ count: 200, error: null }) }),
        upsert,
      }),
    } as unknown as SupabaseClient
    await saveMealMemo(supa, 'u1', 'sushi', 'Sushi', 500, 20, 60, 15)
    expect(upsert).not.toHaveBeenCalled()
  })
})

describe('source-guard: o veneno não pode voltar', () => {
  const learned = readFileSync(join(process.cwd(), 'src/lib/nutrition/learned-foods.ts'), 'utf8')
  const resolver = readFileSync(join(process.cwd(), 'src/lib/nutrition/food-resolver.ts'), 'utf8')

  it('o memo NÃO volta pro parser como alimento por 100g', () => {
    // Era isto: loadLearnedFoods devolvia FoodItem{kcal:...} e o resolver o juntava
    // aos extraFoods do parser, que multiplica por grams/100. Total × peso = veneno.
    expect(learned).not.toContain('loadLearnedFoods')
    expect(learned).not.toContain('FoodItem')
    expect(resolver).not.toContain('loadLearnedFoods')
    // e o memo não entra no mapa de extras do parser
    expect(resolver.replace(/\s+/g, ' ')).toContain('expandFoodKeys({ ...tacoFoods, ...customFoods })')
  })

  it('o memo é consultado DEPOIS da base curada', () => {
    // Ele nasce de um texto que a base não reconheceu — nunca deve disputar com ela.
    const flat = resolver.replace(/\s+/g, ' ')
    expect(flat.indexOf('analyzeMeal(text)')).toBeLessThan(flat.indexOf('loadMealMemo('))
  })

  it('a consulta é indexada por (user_id, food_key), não um load de 500 linhas', () => {
    expect(learned).toContain(".eq('food_key', foodKey)")
    expect(learned).not.toContain('.limit(500)')
  })
})
