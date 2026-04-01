'use client'

import React, { useState, useCallback } from 'react'
import { Utensils, Loader2, Sparkles, Flame, Droplets, Wheat, X } from 'lucide-react'

/* ──────────────────────────────────────────────────────────
 * PostWorkoutMeal
 *
 * Feature 12: Sugestão de Refeição Pós-Treino
 * Shows AI-powered meal suggestion after finishing a workout.
 * ────────────────────────────────────────────────────────── */

interface MealSuggestion {
  name: string
  description: string
  calories: number
  protein: number
  carbs: number
  fat: number
  timing: string
  ingredients: string[]
}

interface PostWorkoutMealProps {
  muscleGroups: string[]
  workoutIntensity?: 'light' | 'moderate' | 'intense'
  durationMinutes?: number
}

export default function PostWorkoutMeal({
  muscleGroups,
  workoutIntensity = 'moderate',
  durationMinutes,
}: PostWorkoutMealProps) {
  const [meal, setMeal] = useState<MealSuggestion | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [dismissed, setDismissed] = useState(false)

  const fetchMeal = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/ai/post-workout-meal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          muscleGroups,
          intensity: workoutIntensity,
          durationMinutes,
        }),
      })
      const data = await res.json()
      if (data?.ok && data?.meal) {
        setMeal(data.meal)
      } else {
        setError(data?.error || 'Erro ao gerar sugestão')
      }
    } catch {
      setError('Erro de conexão')
    } finally {
      setLoading(false)
    }
  }, [muscleGroups, workoutIntensity, durationMinutes])

  if (dismissed) return null

  if (!meal && !loading && !error) {
    return (
      <button
        type="button"
        onClick={fetchMeal}
        disabled={loading}
        className="w-full rounded-xl bg-gradient-to-r from-orange-950/40 to-amber-950/30 border border-orange-500/20 p-3 text-left hover:border-orange-500/40 transition-all active:scale-[0.99]"
      >
        <div className="flex items-center gap-2">
          <Utensils size={16} className="text-orange-400" />
          <div className="flex-1">
            <h3 className="font-black text-white text-xs">Sugestão de Refeição Pós-Treino</h3>
            <p className="text-[10px] text-orange-400/60 mt-0.5">Toque para receber uma sugestão personalizada</p>
          </div>
          <Sparkles size={14} className="text-orange-500/40" />
        </div>
      </button>
    )
  }

  if (loading) {
    return (
      <div className="rounded-xl bg-orange-950/20 border border-orange-500/20 p-3 flex items-center gap-2">
        <Loader2 size={16} className="text-orange-400 animate-spin" />
        <span className="text-xs text-orange-300">Preparando sugestão…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl bg-neutral-900 border border-red-500/20 p-3">
        <p className="text-xs text-red-400">{error}</p>
      </div>
    )
  }

  if (!meal) return null

  return (
    <div className="rounded-xl bg-gradient-to-br from-orange-950/30 to-neutral-900/80 border border-orange-500/15 overflow-hidden">
      <div className="flex items-start justify-between p-3">
        <div className="flex items-center gap-2">
          <Utensils size={14} className="text-orange-400" />
          <h3 className="font-black text-white text-sm">{meal.name}</h3>
        </div>
        <button onClick={() => setDismissed(true)} className="text-neutral-600 hover:text-white p-0.5">
          <X size={14} />
        </button>
      </div>
      <div className="px-3 pb-3 space-y-2">
        <p className="text-xs text-neutral-300">{meal.description}</p>

        {/* Macros */}
        <div className="flex gap-2">
          <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-red-500/10 border border-red-500/20">
            <Flame size={10} className="text-red-400" />
            <span className="text-[10px] font-bold text-red-300">{meal.calories}kcal</span>
          </div>
          <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <Droplets size={10} className="text-blue-400" />
            <span className="text-[10px] font-bold text-blue-300">{meal.protein}g P</span>
          </div>
          <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <Wheat size={10} className="text-amber-400" />
            <span className="text-[10px] font-bold text-amber-300">{meal.carbs}g C</span>
          </div>
        </div>

        {/* Timing */}
        <p className="text-[10px] text-orange-400/60">⏱ {meal.timing}</p>

        {/* Ingredients */}
        {meal.ingredients.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {meal.ingredients.map((ing, i) => (
              <span key={i} className="px-1.5 py-0.5 rounded-md bg-neutral-800/60 text-[9px] text-neutral-400">{ing}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
