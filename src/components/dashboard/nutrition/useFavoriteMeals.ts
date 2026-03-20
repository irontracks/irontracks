'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/utils/supabase/client'

export type FavoriteMeal = {
  id: string
  name: string
  meal_text: string
  created_at: string
}

export function useFavoriteMeals(userId: string | undefined) {
  const supabase = createClient()
  const [favorites, setFavorites] = useState<FavoriteMeal[]>([])
  const [loading, setLoading] = useState(false)

  // Load favorites
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const { data } = await supabase
          .from('nutrition_favorite_meals')
          .select('id, name, meal_text, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(10)
        if (cancelled) return
        setFavorites(
          (Array.isArray(data) ? data : []).map((r) => ({
            id: String((r as Record<string, unknown>).id || ''),
            name: String((r as Record<string, unknown>).name || ''),
            meal_text: String((r as Record<string, unknown>).meal_text || ''),
            created_at: String((r as Record<string, unknown>).created_at || ''),
          }))
        )
      } catch { /* silent */ } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [userId, supabase])

  const saveFavorite = useCallback(async (name: string, meal_text: string): Promise<boolean> => {
    if (!userId || !name.trim() || !meal_text.trim()) return false
    if (favorites.length >= 10) return false
    try {
      const { data, error } = await supabase
        .from('nutrition_favorite_meals')
        .insert({ user_id: userId, name: name.trim().slice(0, 60), meal_text: meal_text.trim().slice(0, 500) })
        .select('id, name, meal_text, created_at')
        .single()
      if (error) return false
      if (data) {
        setFavorites((prev) => [
          {
            id: String((data as Record<string, unknown>).id || ''),
            name: String((data as Record<string, unknown>).name || ''),
            meal_text: String((data as Record<string, unknown>).meal_text || ''),
            created_at: String((data as Record<string, unknown>).created_at || ''),
          },
          ...prev,
        ].slice(0, 10))
      }
      return true
    } catch { return false }
  }, [userId, favorites.length, supabase])

  const deleteFavorite = useCallback(async (id: string): Promise<boolean> => {
    if (!userId || !id) return false
    try {
      const { error } = await supabase
        .from('nutrition_favorite_meals')
        .delete()
        .eq('id', id)
        .eq('user_id', userId)
      if (error) return false
      setFavorites((prev) => prev.filter((f) => f.id !== id))
      return true
    } catch { return false }
  }, [userId, supabase])

  return { favorites, loading, saveFavorite, deleteFavorite }
}
