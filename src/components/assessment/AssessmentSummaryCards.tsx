'use client'

import { TrendingUp, TrendingDown, Activity, Scale, Flame, Dumbbell } from 'lucide-react'
import { computeDelta, type BetterDirection } from './assessmentDelta'

type AssessmentSummaryCardsProps<T> = {
  latestAssessment: T
  previousAssessment: T
  getWeightKg: (a: T) => number | null
  getBodyFatPercent: (a: T) => number | null
  getLeanMassKg: (a: T) => number | null
  getBmrKcal: (a: T) => number | null
}

export const AssessmentSummaryCards = <T,>({
  latestAssessment,
  previousAssessment,
  getWeightKg,
  getBodyFatPercent,
  getLeanMassKg,
  getBmrKcal,
}: AssessmentSummaryCardsProps<T>) => {
  const metrics = [
    {
      label: 'Peso',
      icon: <Scale className="w-4 h-4" />,
      getValue: getWeightKg,
      unit: 'kg',
      color: '#facc15',
      bgGlow: 'rgba(250, 204, 21, 0.06)',
      better: null as BetterDirection,
    },
    {
      label: '% Gordura',
      icon: <Flame className="w-4 h-4" />,
      getValue: getBodyFatPercent,
      unit: '%',
      color: '#ef4444',
      bgGlow: 'rgba(239, 68, 68, 0.06)',
      better: 'down' as BetterDirection,
    },
    {
      label: 'Massa Magra',
      icon: <Dumbbell className="w-4 h-4" />,
      getValue: getLeanMassKg,
      unit: 'kg',
      color: '#22c55e',
      bgGlow: 'rgba(34, 197, 94, 0.06)',
      better: 'up' as BetterDirection,
    },
    {
      label: 'BMR',
      icon: <Activity className="w-4 h-4" />,
      getValue: getBmrKcal,
      unit: 'kcal',
      color: '#f59e0b',
      bgGlow: 'rgba(245, 158, 11, 0.06)',
      better: null as BetterDirection,
    },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      {metrics.map(({ label, icon, getValue, unit, color, bgGlow, better }) => {
        const current = getValue(latestAssessment)
        const previous = getValue(previousAssessment)
        // `computeDelta` é a MESMA fonte que a lista de avaliações usa. Com
        // `getProgress`, peso idêntico entre duas medições devolvia
        // `{change: 0}`, o `isPositive` binário lia isso como negativo, e a tela
        // pintava "0.0 kg" de VERMELHO com seta para baixo — o app dizia que
        // piorou quem não mudou. E a direção era um booleano `invertProgress`,
        // que obriga toda métrica a ter um lado "bom": ganhar peso não é bom nem
        // ruim sem saber o objetivo. `BetterDirection` admite `null`.
        const delta = computeDelta(current, previous, better, unit === 'kcal' ? 0 : 1)
        const TrendIcon = (delta?.diff ?? 0) > 0 ? TrendingUp : TrendingDown
        const corDoDelta = delta?.tone === 'good' ? '#22c55e' : delta?.tone === 'bad' ? '#ef4444' : '#a3a3a3'
        // Derivado do MESMO delta, não de um segundo cálculo: com `getProgress`
        // à parte, os dois podiam discordar sobre a mesma variação.
        const pct = delta && previous ? Math.abs((delta.diff / previous) * 100) : null

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
              <span className="text-[10px] text-neutral-400 font-black uppercase tracking-widest">{label}</span>
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
              <span className="text-xs font-bold text-neutral-400">{current != null ? unit : ''}</span>
            </div>

            {/* Progress */}
            {delta && (
              <div
                className="flex items-center gap-1 mt-2 text-xs font-bold"
                style={{ color: corDoDelta }}
              >
                <TrendIcon className="w-3.5 h-3.5" />
                <span>
                  {delta.label} {unit}
                </span>
                {pct != null && (
                  <span className="text-neutral-400 ml-0.5">({pct.toFixed(1)}%)</span>
                )}
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
