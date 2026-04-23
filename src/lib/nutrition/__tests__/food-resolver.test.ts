import { describe, it, expect, vi, afterEach } from 'vitest'
import { resolveFood } from '../food-resolver'
import * as tacoSource from '../sources/taco-source'
import * as offSource from '../sources/off-source'
import * as learnedFoods from '../learned-foods'
import type { SupabaseClient } from '@supabase/supabase-js'

const mockSupabase = {} as unknown as SupabaseClient

afterEach(() => vi.restoreAllMocks())

describe('resolveFood', () => {
  it('returns meal from hardcoded base when food is known (no Supabase needed)', async () => {
    vi.spyOn(tacoSource, 'loadTacoFoods').mockResolvedValue({})
    vi.spyOn(learnedFoods, 'loadLearnedFoods').mockResolvedValue({})
    vi.spyOn(offSource, 'searchOffByText').mockResolvedValue({})

    const result = await resolveFood(mockSupabase, 'user-1', '150g frango')
    expect(result).not.toBeNull()
    expect(result!.meal.calories).toBeGreaterThan(0)
    expect(result!.meal.protein).toBeGreaterThan(0)
    expect(result!.source).toBe('local')
  })

  it('returns meal from TACO when food not in hardcoded base', async () => {
    vi.spyOn(tacoSource, 'loadTacoFoods').mockResolvedValue({
      'caldo-de-cana': { kcal: 62, p: 0.3, c: 16, f: 0.1 },
      'caldo de cana': { kcal: 62, p: 0.3, c: 16, f: 0.1 },
    })
    vi.spyOn(learnedFoods, 'loadLearnedFoods').mockResolvedValue({})
    vi.spyOn(offSource, 'searchOffByText').mockResolvedValue({})

    const result = await resolveFood(mockSupabase, 'user-1', '200ml caldo de cana')
    expect(result).not.toBeNull()
    expect(result!.meal.calories).toBeGreaterThan(0)
    expect(result!.source).toBe('taco_or_learned')
  })

  it('returns meal from OFF when not in local or TACO', async () => {
    vi.spyOn(tacoSource, 'loadTacoFoods').mockResolvedValue({})
    vi.spyOn(learnedFoods, 'loadLearnedFoods').mockResolvedValue({})
    vi.spyOn(offSource, 'searchOffByText').mockResolvedValue({
      'whey-gold-standard-optimum-nutrition': { kcal: 400, p: 80, c: 10, f: 7 },
      'whey gold standard': { kcal: 400, p: 80, c: 10, f: 7 },
    })

    const result = await resolveFood(mockSupabase, 'user-1', '30g whey gold standard')
    expect(result).not.toBeNull()
    expect(result!.meal.protein).toBeGreaterThan(0)
    expect(result!.source).toBe('off')
  })

  it('returns null when nothing resolves (caller should use Gemini)', async () => {
    vi.spyOn(tacoSource, 'loadTacoFoods').mockResolvedValue({})
    vi.spyOn(learnedFoods, 'loadLearnedFoods').mockResolvedValue({})
    vi.spyOn(offSource, 'searchOffByText').mockResolvedValue({})

    const result = await resolveFood(mockSupabase, 'user-1', 'xyzcomida12345desconhecida')
    expect(result).toBeNull()
  })

  it('skips OFF if Phase 1 succeeds', async () => {
    const searchSpy = vi.spyOn(offSource, 'searchOffByText').mockResolvedValue({})
    vi.spyOn(tacoSource, 'loadTacoFoods').mockResolvedValue({})
    vi.spyOn(learnedFoods, 'loadLearnedFoods').mockResolvedValue({})

    await resolveFood(mockSupabase, 'user-1', '100g arroz cozido')
    expect(searchSpy).not.toHaveBeenCalled()
  })
})
