/**
 * @module useCustomFoods
 *
 * Manages the user's custom food library (nutrition_custom_foods table).
 * Provides CRUD operations and converts foods to the extraFoods format
 * expected by parseInput so custom products are auto-recognized in the input.
 */
'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/utils/supabase/client'

export interface CustomFood {
  id: string
  name: string
  aliases: string[]
  serving_size_g: number
  kcal_per100g: number
  protein_per100g: number
  carbs_per100g: number
  fat_per100g: number
  fiber_per100g: number
  label_image_url: string | null
  created_at: string
}

export interface CustomFoodDraft {
  name: string
  aliases: string[]
  serving_size_g: number
  kcal_per100g: number
  protein_per100g: number
  carbs_per100g: number
  fat_per100g: number
  fiber_per100g: number
  label_image_url: string | null
}

/** Convert custom foods to the extraFoods format consumed by parseInput */
export function customFoodsToExtraFoods(foods: CustomFood[]): Record<string, { kcal: number; p: number; c: number; f: number }> {
  const result: Record<string, { kcal: number; p: number; c: number; f: number }> = {}
  for (const food of foods) {
    const entry = {
      kcal: food.kcal_per100g,
      p: food.protein_per100g,
      c: food.carbs_per100g,
      f: food.fat_per100g,
    }
    // Register under primary name and all aliases
    result[food.name.toLowerCase()] = entry
    for (const alias of food.aliases) {
      if (alias.trim()) result[alias.trim().toLowerCase()] = entry
    }
  }
  return result
}

export function useCustomFoods(userId: string | null | undefined) {
  const [foods, setFoods] = useState<CustomFood[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const supabase = createClient()

  const load = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('nutrition_custom_foods')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50)
      if (err) throw new Error(err.message)
      setFoods((data as CustomFood[]) || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar alimentos')
    } finally {
      setLoading(false)
    }
  }, [userId, supabase])

  useEffect(() => { load() }, [load])

  const saveFood = useCallback(async (draft: CustomFoodDraft): Promise<{ ok: boolean; error?: string }> => {
    if (!userId) return { ok: false, error: 'not_authenticated' }
    setSaving(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('nutrition_custom_foods')
        .insert({
          user_id: userId,
          name: draft.name.trim(),
          aliases: draft.aliases.map(a => a.trim()).filter(Boolean),
          serving_size_g: draft.serving_size_g,
          kcal_per100g: draft.kcal_per100g,
          protein_per100g: draft.protein_per100g,
          carbs_per100g: draft.carbs_per100g,
          fat_per100g: draft.fat_per100g,
          fiber_per100g: draft.fiber_per100g,
          label_image_url: draft.label_image_url,
          updated_at: new Date().toISOString(),
        })
        .select()
        .single()
      if (err) {
        if (err.message.includes('custom_foods_limit_reached')) {
          return { ok: false, error: 'Limite de 50 alimentos atingido. Exclua um antes de adicionar.' }
        }
        throw new Error(err.message)
      }
      setFoods(prev => [data as CustomFood, ...prev])
      return { ok: true }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro ao salvar'
      setError(msg)
      return { ok: false, error: msg }
    } finally {
      setSaving(false)
    }
  }, [userId, supabase])

  const deleteFood = useCallback(async (id: string): Promise<void> => {
    if (!userId) return
    try {
      await supabase
        .from('nutrition_custom_foods')
        .delete()
        .eq('id', id)
        .eq('user_id', userId)
      setFoods(prev => prev.filter(f => f.id !== id))
    } catch { /* silent — UI already optimistic */ }
  }, [userId, supabase])

  return { foods, loading, saving, error, saveFood, deleteFood, reload: load }
}
