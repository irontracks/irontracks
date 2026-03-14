'use client'

import { Calculator, TrendingUp } from 'lucide-react'

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
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      {[
        { label: 'Peso', icon: <TrendingUp className="w-4 h-4" />, getValue: getWeightKg, unit: 'kg', color: '#f59e0b', invertProgress: false },
        { label: '% Gordura', icon: <Calculator className="w-4 h-4" />, getValue: getBodyFatPercent, unit: '%', color: '#ef4444', invertProgress: true },
        { label: 'Massa Magra', icon: <TrendingUp className="w-4 h-4" />, getValue: getLeanMassKg, unit: 'kg', color: '#10b981', invertProgress: false },
        { label: 'BMR', icon: <Calculator className="w-4 h-4" />, getValue: getBmrKcal, unit: 'kcal', color: '#6366f1', invertProgress: false },
      ].map(({ label, icon, getValue, unit, color, invertProgress }) => {
        const current = getValue(latestAssessment)
        const previous = getValue(previousAssessment)
        const progress = getProgress(current, previous)
        const isPositive = invertProgress ? (progress?.change ?? 0) < 0 : (progress?.change ?? 0) > 0

        return (
          <div
            key={label}
            className="rounded-xl p-4 relative overflow-hidden border"
            style={{
              background: 'linear-gradient(160deg, rgba(20,18,10,0.8) 0%, rgba(12,12,12,0.95) 50%)',
              borderColor: 'rgba(255,255,255,0.06)',
              borderLeftColor: `${color}40`,
              borderLeftWidth: 3,
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] text-neutral-500 font-black uppercase tracking-widest">{label}</span>
              <span style={{ color }} className="opacity-60">{icon}</span>
            </div>
            <div className="text-2xl font-black text-white">
              {current != null ? (unit === 'kcal' ? current.toFixed(0) : current.toFixed(1)) : '-'}
              <span className="text-sm font-bold text-neutral-500 ml-1">{current != null ? unit : ''}</span>
            </div>
            {progress && (
              <div className={`text-xs font-bold mt-1 ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                {progress.change > 0 ? '+' : ''}{unit === 'kcal' ? progress.change.toFixed(0) : progress.change.toFixed(1)} {unit} ({progress.percentage.toFixed(1)}%)
              </div>
            )}
            {/* Subtle shimmer */}
            <div
              className="absolute top-0 right-0 w-16 h-full pointer-events-none opacity-[0.03]"
              style={{ background: `linear-gradient(180deg, ${color}, transparent)` }}
            />
          </div>
        )
      })}
    </div>
  )
}
