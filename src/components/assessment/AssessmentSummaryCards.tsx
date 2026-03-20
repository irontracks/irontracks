'use client'

import { TrendingUp, TrendingDown, Activity, Scale, Flame, Dumbbell } from 'lucide-react'

type AssessmentSummaryCardsProps<T> = {
  latestAssessment: T
  previousAssessment: T
  getWeightKg: (a: T) => number | null
  getBodyFatPercent: (a: T) => number | null
  getLeanMassKg: (a: T) => number | null
  getBmrKcal: (a: T) => number | null
  getProgress: (current: number | null, previous: number | null) => { change: number; percentage: number } | null
}

export const AssessmentSummaryCards = <T,>({
  latestAssessment,
  previousAssessment,
  getWeightKg,
  getBodyFatPercent,
  getLeanMassKg,
  getBmrKcal,
  getProgress,
}: AssessmentSummaryCardsProps<T>) => {
  const metrics = [
    {
      label: 'Peso',
      icon: <Scale className="w-4 h-4" />,
      getValue: getWeightKg,
      unit: 'kg',
      color: '#facc15',
      bgGlow: 'rgba(250, 204, 21, 0.06)',
      invertProgress: false,
    },
    {
      label: '% Gordura',
      icon: <Flame className="w-4 h-4" />,
      getValue: getBodyFatPercent,
      unit: '%',
      color: '#ef4444',
      bgGlow: 'rgba(239, 68, 68, 0.06)',
      invertProgress: true,
    },
    {
      label: 'Massa Magra',
      icon: <Dumbbell className="w-4 h-4" />,
      getValue: getLeanMassKg,
      unit: 'kg',
      color: '#22c55e',
      bgGlow: 'rgba(34, 197, 94, 0.06)',
      invertProgress: false,
    },
    {
      label: 'BMR',
      icon: <Activity className="w-4 h-4" />,
      getValue: getBmrKcal,
      unit: 'kcal',
      color: '#8b5cf6',
      bgGlow: 'rgba(139, 92, 246, 0.06)',
      invertProgress: false,
    },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      {metrics.map(({ label, icon, getValue, unit, color, bgGlow, invertProgress }) => {
        const current = getValue(latestAssessment)
        const previous = getValue(previousAssessment)
        const progress = getProgress(current, previous)
        const isPositive = invertProgress ? (progress?.change ?? 0) < 0 : (progress?.change ?? 0) > 0
        const TrendIcon = isPositive ? TrendingUp : TrendingDown

        return (
          <div
            key={label}
            className="rounded-2xl p-4 relative overflow-hidden border transition-all duration-300 hover:scale-[1.02]"
            style={{
              background: `linear-gradient(160deg, ${bgGlow} 0%, rgba(10,10,10,0.95) 70%)`,
              borderColor: `${color}18`,
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] text-neutral-500 font-black uppercase tracking-widest">{label}</span>
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: `${color}12`, color }}
              >
                {icon}
              </div>
            </div>

            {/* Value */}
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-white tracking-tight">
                {current != null ? (unit === 'kcal' ? current.toFixed(0) : current.toFixed(1)) : '-'}
              </span>
              <span className="text-xs font-bold text-neutral-500">{current != null ? unit : ''}</span>
            </div>

            {/* Progress */}
            {progress && (
              <div
                className="flex items-center gap-1 mt-2 text-xs font-bold"
                style={{ color: isPositive ? '#22c55e' : '#ef4444' }}
              >
                <TrendIcon className="w-3.5 h-3.5" />
                <span>
                  {progress.change > 0 ? '+' : ''}
                  {unit === 'kcal' ? progress.change.toFixed(0) : progress.change.toFixed(1)} {unit}
                </span>
                <span className="text-neutral-600 ml-0.5">
                  ({Math.abs(progress.percentage).toFixed(1)}%)
                </span>
              </div>
            )}

            {/* Accent line */}
            <div
              className="absolute bottom-0 left-3 right-3 h-[2px] rounded-full opacity-40"
              style={{ backgroundColor: color }}
            />
          </div>
        )
      })}
    </div>
  )
}
