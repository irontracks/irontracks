import { describe, it, expect } from 'vitest'
import { loadTacoFoods } from '../sources/taco-source'
import type { SupabaseClient } from '@supabase/supabase-js'

const makeMockSupabase = (rows: unknown[]) =>
  ({
    from: () => ({
      select: () => ({ data: rows, error: null }),
    }),
  }) as unknown as SupabaseClient

describe('loadTacoFoods', () => {
  it('returns empty object when Supabase returns no rows', async () => {
    const supabase = makeMockSupabase([])
    const result = await loadTacoFoods(supabase)
    expect(result).toEqual({})
  })

  it('maps food_key to FoodItem with correct macro fields', async () => {
    const supabase = makeMockSupabase([
      {
        food_key: 'arroz-branco-cozido',
        name: 'Arroz branco cozido',
        aliases: ['arroz', 'arroz branco'],
        kcal_per_100g: 130,
        protein: 2.5,
        carbs: 28.1,
        fat: 0.3,
        fiber: null,
      },
    ])
    const result = await loadTacoFoods(supabase)
    expect(result['arroz-branco-cozido']).toEqual({ kcal: 130, p: 2.5, c: 28.1, f: 0.3 })
  })

  it('adds aliases as additional keys pointing to the same FoodItem', async () => {
    const supabase = makeMockSupabase([
      {
        food_key: 'arroz-branco-cozido',
        name: 'Arroz branco cozido',
        aliases: ['arroz', 'arroz branco'],
        kcal_per_100g: 130,
        protein: 2.5,
        carbs: 28.1,
        fat: 0.3,
        fiber: null,
      },
    ])
    const result = await loadTacoFoods(supabase)
    expect(result['arroz']).toBeDefined()
    expect(result['arroz branco']).toBeDefined()
    expect(result['arroz'].kcal).toBe(130)
  })

  it('returns empty object when Supabase returns an error', async () => {
    const supabase = {
      from: () => ({
        select: () => ({ data: null, error: new Error('db error') }),
      }),
    } as unknown as SupabaseClient
    const result = await loadTacoFoods(supabase)
    expect(result).toEqual({})
  })
})
