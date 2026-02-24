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
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <div className="rounded-lg p-4 bg-neutral-900 border border-neutral-700">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-neutral-400 font-bold uppercase">Peso</span>
          <TrendingUp className="w-4 h-4 text-yellow-500" />
        </div>
        <div className="text-2xl font-bold">
          {(() => {
            const v = getWeightKg(latestAssessment)
            return v ? `${v.toFixed(1)} kg` : '-'
          })()}
        </div>
        {(() => {
          const progress = getProgress(getWeightKg(latestAssessment), getWeightKg(previousAssessment))
          return (
            progress && (
              <div className={`text-sm ${progress.change > 0 ? 'text-green-400' : 'text-red-400'}`}>
                {progress.change > 0 ? '+' : ''}
                {progress.change.toFixed(1)} kg ({progress.percentage.toFixed(1)}%)
              </div>
            )
          )
        })()}
      </div>
      <div className="rounded-lg p-4 bg-neutral-900 border border-neutral-700">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-neutral-400 font-bold uppercase">% Gordura</span>
          <Calculator className="w-4 h-4 text-yellow-500" />
        </div>
        <div className="text-2xl font-bold">
          {(() => {
            const bf = getBodyFatPercent(latestAssessment)
            return bf ? `${bf.toFixed(1)}%` : '-'
          })()}
        </div>
        {(() => {
          const progress = getProgress(getBodyFatPercent(latestAssessment), getBodyFatPercent(previousAssessment))
          return (
            progress && (
              <div className={`text-sm ${progress.change < 0 ? 'text-green-400' : 'text-red-400'}`}>
                {progress.change > 0 ? '+' : ''}
                {progress.change.toFixed(1)}% ({progress.percentage.toFixed(1)}%)
              </div>
            )
          )
        })()}
      </div>
      <div className="rounded-lg p-4 bg-neutral-900 border border-neutral-700">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-neutral-400 font-bold uppercase">Massa Magra</span>
          <TrendingUp className="w-4 h-4 text-yellow-500" />
        </div>
        <div className="text-2xl font-bold">
          {(() => {
            const lm = getLeanMassKg(latestAssessment)
            return lm ? `${lm.toFixed(1)} kg` : '-'
          })()}
        </div>
        {(() => {
          const currentLm = getLeanMassKg(latestAssessment)
          const previousLm = getLeanMassKg(previousAssessment)
          const progress = getProgress(currentLm, previousLm)
          return (
            progress && (
              <div className={`text-sm ${progress.change > 0 ? 'text-green-400' : 'text-red-400'}`}>
                {progress.change > 0 ? '+' : ''}
                {progress.change.toFixed(1)} kg ({progress.percentage.toFixed(1)}%)
              </div>
            )
          )
        })()}
      </div>
      <div className="rounded-lg p-4 bg-neutral-900 border border-neutral-700">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-neutral-400 font-bold uppercase">BMR</span>
          <Calculator className="w-4 h-4 text-yellow-500" />
        </div>
        <div className="text-2xl font-bold">
          {(() => {
            const v = getBmrKcal(latestAssessment)
            return v ? v.toFixed(0) : '-'
          })()}{' '}
          kcal
        </div>
        {(() => {
          const progress = getProgress(getBmrKcal(latestAssessment), getBmrKcal(previousAssessment))
          return (
            progress && (
              <div className={`text-sm ${progress.change > 0 ? 'text-green-400' : 'text-red-400'}`}>
                {progress.change > 0 ? '+' : ''}
                {progress.change.toFixed(0)} kcal ({progress.percentage.toFixed(1)}%)
              </div>
            )
          )
        })()}
      </div>
    </div>
  )
}
