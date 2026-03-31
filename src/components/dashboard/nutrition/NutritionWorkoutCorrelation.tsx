'use client'
/**
 * NutritionWorkoutCorrelation
 *
 * Shows the last 30 days as a heatmap:
 * - Green: trained + logged nutrition
 * - Yellow: trained, no nutrition
 * - Blue: nutrition only, no training
 * - Gray: neither
 */
import React, { useEffect, useState } from 'react'
import { TrendingUp, Loader2 } from 'lucide-react'

interface DayData {
  date: string
  weekday: number
  had_workout: boolean
  had_nutrition: boolean
  workout_calories: number
  nutrition_calories: number
}

interface Stats {
  workoutDays: number
  nutritionDays: number
  bothDays: number
  workoutWithoutNutrition: number
  correlationPct: number
}

const DAY_LABELS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

const getDayColor = (d: DayData): string => {
  if (d.had_workout && d.had_nutrition) return '#22c55e' // green - both
  if (d.had_workout && !d.had_nutrition) return '#f59e0b' // amber - workout only
  if (!d.had_workout && d.had_nutrition) return '#3b82f6' // blue - nutrition only
  return 'rgba(255,255,255,0.06)' // gray - neither
}

const getDayTitle = (d: DayData): string => {
  const parts = []
  if (d.had_workout) parts.push(`Treino${d.workout_calories ? ` (${d.workout_calories} kcal)` : ''}`)
  if (d.had_nutrition) parts.push(`Nutrição${d.nutrition_calories ? ` (${Math.round(d.nutrition_calories)} kcal)` : ''}`)
  return parts.length ? parts.join(' + ') : 'Sem registro'
}

export default function NutritionWorkoutCorrelation() {
  const [days, setDays] = useState<DayData[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/nutrition/correlation')
      .then(r => r.json())
      .then(json => {
        if (json.ok) {
          setDays(json.days)
          setStats(json.stats)
        }
      })
      .catch(() => { /* ignore */ })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="rounded-2xl p-4 flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <Loader2 size={20} className="animate-spin text-yellow-500" />
    </div>
  )

  if (!stats) return null

  // Group days into weeks (rows of 7)
  const weeks: DayData[][] = []
  let currentWeek: DayData[] = []
  // Pad first week
  if (days.length > 0) {
    const firstDayOfWeek = days[0].weekday
    for (let i = 0; i < firstDayOfWeek; i++) {
      currentWeek.push({ date: '', weekday: i, had_workout: false, had_nutrition: false, workout_calories: 0, nutrition_calories: 0 })
    }
  }
  for (const d of days) {
    currentWeek.push(d)
    if (currentWeek.length === 7) {
      weeks.push(currentWeek)
      currentWeek = []
    }
  }
  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) {
      currentWeek.push({ date: '', weekday: currentWeek.length, had_workout: false, had_nutrition: false, workout_calories: 0, nutrition_calories: 0 })
    }
    weeks.push(currentWeek)
  }

  return (
    <div
      className="rounded-2xl p-4 space-y-4"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <TrendingUp size={14} className="text-yellow-500" />
        <p className="text-sm font-black text-white">Treino × Nutrição — últimos 30 dias</p>
      </div>

      {/* Day-of-week labels */}
      <div className="grid grid-cols-7 gap-1 text-center">
        {DAY_LABELS.map((l, i) => (
          <div key={i} className="text-[9px] font-bold text-white/20">{l}</div>
        ))}
      </div>

      {/* Heatmap grid */}
      <div className="space-y-1">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-1">
            {week.map((d, di) => (
              <div
                key={`${wi}-${di}`}
                title={d.date ? `${d.date}: ${getDayTitle(d)}` : ''}
                className="aspect-square rounded-sm"
                style={{ background: d.date ? getDayColor(d) : 'transparent' }}
              />
            ))}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs text-white/40">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: '#22c55e' }} />Ambos</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: '#f59e0b' }} />Só treino</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: '#3b82f6' }} />Só nutrição</span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Treinos', value: stats.workoutDays },
          { label: 'Nutrição', value: stats.nutritionDays },
          { label: 'Sincronia', value: `${stats.correlationPct}%` },
        ].map(s => (
          <div
            key={s.label}
            className="flex flex-col items-center gap-0.5 rounded-xl py-2.5"
            style={{ background: 'rgba(255,255,255,0.03)' }}
          >
            <span className="text-lg font-black text-white">{s.value}</span>
            <span className="text-[10px] text-white/30 font-bold">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Insight */}
      {stats.workoutWithoutNutrition > 0 && (
        <p className="text-xs text-amber-400/70">
          ⚡ Em {stats.workoutWithoutNutrition} dias você treinou sem registrar a nutrição — registrar ajuda a otimizar os resultados.
        </p>
      )}
    </div>
  )
}
