'use client'
/**
 * NutritionDayScore
 *
 * Calculates a 0-100 quality score for the day based on:
 * - Calorie adherence to goal (40 pts)
 * - Protein adherence (30 pts)
 * - Carbs adherence (15 pts)
 * - Fat adherence (15 pts)
 *
 * Shows a color-coded badge with grade and breakdown.
 */
import { memo, useMemo, useState } from 'react'

interface Totals { calories: number; protein: number; carbs: number; fat: number }

interface Props {
  totals: Totals
  goals: Totals
}

function scoreMacro(actual: number, goal: number, weight: number): number {
  if (goal <= 0) return weight // No goal set → full points
  const ratio = actual / goal
  // Perfect: 90-110% → full points. Graceful falloff outside.
  if (ratio >= 0.9 && ratio <= 1.1) return weight
  if (ratio < 0.9) return Math.round(weight * (ratio / 0.9))
  // Over: > 110% → penalty
  const over = ratio - 1.1
  return Math.max(0, Math.round(weight * (1 - over * 2)))
}

function gradeLabel(score: number) {
  if (score >= 90) return { label: 'Excelente', color: '#22c55e', bg: 'bg-green-500/15 border-green-500/30 text-green-300' }
  if (score >= 75) return { label: 'Ótimo', color: '#84cc16', bg: 'bg-lime-500/15 border-lime-500/30 text-lime-300' }
  if (score >= 60) return { label: 'Bom', color: '#facc15', bg: 'bg-yellow-500/15 border-yellow-500/30 text-yellow-300' }
  if (score >= 40) return { label: 'Regular', color: '#f97316', bg: 'bg-orange-500/15 border-orange-500/30 text-orange-300' }
  return { label: 'Melhorar', color: '#ef4444', bg: 'bg-red-500/15 border-red-500/30 text-red-300' }
}

const NutritionDayScore = memo(function NutritionDayScore({ totals, goals }: Props) {
  const [expanded, setExpanded] = useState(false)

  const score = useMemo(() => {
    // Only score if there's any intake today
    if (!totals.calories) return null
    const s = scoreMacro(totals.calories, goals.calories, 40)
      + scoreMacro(totals.protein, goals.protein, 30)
      + scoreMacro(totals.carbs, goals.carbs, 15)
      + scoreMacro(totals.fat, goals.fat, 15)
    return Math.min(100, Math.max(0, s))
  }, [totals, goals])

  if (score === null) return null

  const grade = gradeLabel(score)

  return (
    <button
      type="button"
      onClick={() => setExpanded(v => !v)}
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-semibold border transition ${grade.bg}`}
    >
      <span className="text-base leading-none">🏅</span>
      <span>Score {score}/100</span>
      <span className="text-[10px] opacity-70">— {grade.label}</span>
      {expanded && (
        <span className="ml-1 text-[9px] opacity-60">
          · Cal {scoreMacro(totals.calories, goals.calories, 40)}/40
          · Pro {scoreMacro(totals.protein, goals.protein, 30)}/30
          · C {scoreMacro(totals.carbs, goals.carbs, 15)}/15
          · G {scoreMacro(totals.fat, goals.fat, 15)}/15
        </span>
      )}
    </button>
  )
})

export default NutritionDayScore
