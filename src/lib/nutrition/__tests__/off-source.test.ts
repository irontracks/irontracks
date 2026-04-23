import { describe, it, expect, vi, afterEach } from 'vitest'
import { searchOffByText, lookupOffByBarcode, buildFoodKeyFromOff } from '../sources/off-source'
import type { SupabaseClient } from '@supabase/supabase-js'

// Minimal mock Supabase that returns empty for cache misses
const makeCacheMissSupabase = () =>
  ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
        ilike: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
      }),
      insert: () => ({ select: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    }),
  }) as unknown as SupabaseClient

const makeOFFProductResponse = (name: string, brand: string) => ({
  ok: true,
  json: async () => ({
    status: 1,
    product: {
      product_name: name,
      brands: brand,
      nutriments: {
        'energy-kcal_100g': 120,
        proteins_100g: 25,
        carbohydrates_100g: 2,
        fat_100g: 3,
        fiber_100g: 0,
      },
    },
  }),
})

describe('buildFoodKeyFromOff', () => {
  it('generates slug from name + brand', () => {
    expect(buildFoodKeyFromOff('Whey Gold Standard', 'Optimum Nutrition')).toBe(
      'whey-gold-standard-optimum-nutrition',
    )
  })

  it('handles name only when brand is empty', () => {
    expect(buildFoodKeyFromOff('Frango grelhado', '')).toBe('frango-grelhado')
  })
})

describe('lookupOffByBarcode', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns null when product not found on OFF API', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ status: 0 }),
    } as Response)

    const result = await lookupOffByBarcode(makeCacheMissSupabase(), '1234567890123')
    expect(result).toBeNull()
  })

  it('returns FoodItem when OFF API finds the product', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeOFFProductResponse('Peito de frango cozido', 'Sadia') as unknown as Response,
    )

    const result = await lookupOffByBarcode(makeCacheMissSupabase(), '7891000100103')
    expect(result).not.toBeNull()
    expect(result!.item.kcal).toBe(120)
    expect(result!.item.p).toBe(25)
    expect(result!.name).toContain('Peito de frango cozido')
  })
})

describe('searchOffByText', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns empty record when OFF API returns no results', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ count: 0, products: [] }),
    } as unknown as Response)

    const result = await searchOffByText(makeCacheMissSupabase(), 'xyznotafood')
    expect(result).toEqual({})
  })

  it('returns FoodItem map when OFF API finds products', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        count: 1,
        products: [
          {
            product_name: 'Whey Protein Gold Standard',
            brands: 'Optimum Nutrition',
            nutriments: {
              'energy-kcal_100g': 400,
              proteins_100g: 80,
              carbohydrates_100g: 10,
              fat_100g: 7,
              fiber_100g: 0,
            },
          },
        ],
      }),
    } as unknown as Response)

    const result = await searchOffByText(makeCacheMissSupabase(), 'whey gold standard')
    const keys = Object.keys(result)
    expect(keys.length).toBeGreaterThan(0)
    const item = result[keys[0]]
    expect(item.kcal).toBe(400)
    expect(item.p).toBe(80)
  })
})
