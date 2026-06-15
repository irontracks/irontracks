import { describe, it, expect, vi } from 'vitest'

// Mock do idb com um KV em memória — testa a lógica do cache sem IndexedDB.
vi.mock('../idb', () => {
  const store = new Map<string, unknown>()
  return {
    kvGet: vi.fn(async (k: unknown) => (store.has(String(k)) ? store.get(String(k)) : null)),
    kvSet: vi.fn(async (k: unknown, v: unknown) => { store.set(String(k), v); return true }),
  }
})

import {
  setNutritionOverlayCache,
  getNutritionOverlayCache,
  setNutritionMealsCache,
  getNutritionMealsCache,
  setCustomFoodsCache,
  getCustomFoodsCache,
} from '../nutritionCache'

describe('nutritionCache', () => {
  const uid = 'user-1'
  const day = '2026-06-15'

  it('faz round-trip do overlay e carimba cachedAt', async () => {
    const data = {
      totals: { calories: 1200, protein: 80, carbs: 100, fat: 40 },
      goals: { calories: 2000, protein: 150, carbs: 200, fat: 60 },
      goalsSource: 'saved',
      workoutCalories: 615,
    }
    await setNutritionOverlayCache(uid, day, data)
    const got = await getNutritionOverlayCache(uid, day)
    expect(got?.totals.calories).toBe(1200)
    expect(got?.goalsSource).toBe('saved')
    expect(got?.workoutCalories).toBe(615)
    expect(typeof got?.cachedAt).toBe('number')
  })

  it('faz round-trip das refeições + água', async () => {
    const entries = [{ id: 'a', food_name: 'Frango', calories: 200 } as Record<string, unknown>]
    await setNutritionMealsCache(uid, day, { entries, water_ml: 750 })
    const got = await getNutritionMealsCache(uid, day)
    expect(got?.entries.length).toBe(1)
    expect(got?.water_ml).toBe(750)
  })

  it('faz round-trip da biblioteca (custom foods)', async () => {
    await setCustomFoodsCache(uid, [{ id: 'f1', name: 'Whey' }])
    const got = await getCustomFoodsCache(uid)
    expect(got.length).toBe(1)
    expect(got[0]?.name).toBe('Whey')
  })

  it('retorna null/[] quando não há cache', async () => {
    expect(await getNutritionOverlayCache(uid, '2000-01-01')).toBeNull()
    expect(await getNutritionMealsCache(uid, '2000-01-01')).toBeNull()
    expect(await getCustomFoodsCache('inexistente')).toEqual([])
  })

  it('não grava nem lê com uid/dateKey vazios (guarda)', async () => {
    await setNutritionOverlayCache('', day, {
      totals: { calories: 1, protein: 1, carbs: 1, fat: 1 },
      goals: { calories: 1, protein: 1, carbs: 1, fat: 1 },
      goalsSource: 'default',
      workoutCalories: 0,
    })
    expect(await getNutritionOverlayCache('', day)).toBeNull()
    expect(await getNutritionMealsCache(uid, '')).toBeNull()
  })
})
