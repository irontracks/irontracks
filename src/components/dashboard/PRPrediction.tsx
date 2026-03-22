'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { TrendingUp, Target, Loader2, ChevronDown, ChevronUp } from 'lucide-react'

/* ──────────────────────────────────────────────────────────
 * PRPrediction
 *
 * Analyzes progression curve for a specific exercise and
 * predicts when a target PR will be achieved.
 * Uses client-side linear regression — no API call needed.
 * ────────────────────────────────────────────────────────── */

interface PRPredictionProps {
  exerciseName: string
  currentMax: number
  history: Array<{
    date: string
    weight: number
  }>
  unit?: string
}

function linearRegression(points: Array<{ x: number; y: number }>) {
  const n = points.length
  if (n < 2) return null
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0
  for (const p of points) {
    sumX += p.x
    sumY += p.y
    sumXY += p.x * p.y
    sumXX += p.x * p.x
  }
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX)
  const intercept = (sumY - slope * sumX) / n
  return { slope, intercept }
}

function predictWeeksToTarget(
  history: Array<{ date: string; weight: number }>,
  target: number
): { weeks: number; confidence: 'high' | 'medium' | 'low' } | null {
  if (history.length < 3) return null

  // Convert dates to week numbers from first entry
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date))
  const firstMs = new Date(sorted[0].date).getTime()
  const points = sorted.map(h => ({
    x: (new Date(h.date).getTime() - firstMs) / (7 * 24 * 3600 * 1000), // weeks
    y: h.weight,
  }))

  const reg = linearRegression(points)
  if (!reg || reg.slope <= 0) return null // Not progressing

  const lastX = points[points.length - 1].x
  const currentPredicted = reg.slope * lastX + reg.intercept
  const targetX = (target - reg.intercept) / reg.slope
  const weeksFromNow = Math.max(0, Math.ceil(targetX - lastX))

  // Confidence based on R² proxy
  const residuals = points.map(p => Math.abs(p.y - (reg.slope * p.x + reg.intercept)))
  const avgResidual = residuals.reduce((s, r) => s + r, 0) / residuals.length
  const relError = avgResidual / (currentPredicted || 1)
  const confidence = relError < 0.05 ? 'high' : relError < 0.15 ? 'medium' : 'low'

  return { weeks: weeksFromNow, confidence }
}

export default function PRPrediction({
  exerciseName,
  currentMax,
  history,
  unit = 'kg',
}: PRPredictionProps) {
  const [target, setTarget] = useState(() => {
    // Smart default: next round number above current max
    const rounded = Math.ceil(currentMax / 5) * 5
    return rounded > currentMax ? rounded : rounded + 5
  })
  const [expanded, setExpanded] = useState(false)

  const prediction = predictWeeksToTarget(history, target)

  if (history.length < 3) return null // Not enough data

  const progressRate = (() => {
    const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date))
    if (sorted.length < 2) return null
    const firstW = sorted[0].weight
    const lastW = sorted[sorted.length - 1].weight
    const firstMs = new Date(sorted[0].date).getTime()
    const lastMs = new Date(sorted[sorted.length - 1].date).getTime()
    const weeks = Math.max(1, (lastMs - firstMs) / (7 * 24 * 3600 * 1000))
    return (lastW - firstW) / weeks
  })()

  const confidenceColor = prediction?.confidence === 'high'
    ? 'text-emerald-400'
    : prediction?.confidence === 'medium'
      ? 'text-yellow-400'
      : 'text-orange-400'

  return (
    <div className="rounded-xl bg-gradient-to-r from-amber-950/30 to-neutral-900/60 border border-amber-500/15 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
      >
        <Target size={14} className="text-amber-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="text-[10px] font-black uppercase text-amber-500/80 tracking-wider">Predição de PR</span>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-sm font-black text-white">
              {currentMax}{unit} → {target}{unit}
            </span>
            {prediction && (
              <span className={`text-xs font-bold ${confidenceColor}`}>
                ~{prediction.weeks} semanas
              </span>
            )}
          </div>
        </div>
        {expanded ? <ChevronUp size={14} className="text-neutral-500" /> : <ChevronDown size={14} className="text-neutral-500" />}
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          {/* Target selector */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-neutral-500 font-bold">Meta:</span>
            <div className="flex gap-1">
              {[5, 10, 15, 20].map(increment => {
                const val = Math.ceil(currentMax / 5) * 5 + increment - 5
                const isActive = target === val
                return (
                  <button
                    key={increment}
                    onClick={() => setTarget(val)}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all ${
                      isActive
                        ? 'bg-amber-500/20 border border-amber-500/40 text-amber-400'
                        : 'bg-neutral-800/50 border border-neutral-700/50 text-neutral-500 hover:text-white'
                    }`}
                  >
                    {val}{unit}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Prediction result */}
          {prediction ? (
            <div className="rounded-lg bg-neutral-900/60 border border-neutral-800/50 p-2">
              <div className="flex items-center gap-2">
                <TrendingUp size={13} className="text-emerald-400" />
                <span className="text-xs text-neutral-300">
                  Estimativa: <strong className="text-white">{prediction.weeks} semanas</strong>
                </span>
                <span className={`text-[9px] font-bold ${confidenceColor}`}>
                  ({prediction.confidence === 'high' ? 'confiança alta' : prediction.confidence === 'medium' ? 'confiança média' : 'pouco dados'})
                </span>
              </div>
              {progressRate !== null && progressRate > 0 && (
                <p className="text-[10px] text-neutral-500 mt-1">
                  Ritmo atual: +{progressRate.toFixed(1)}{unit}/semana
                </p>
              )}
            </div>
          ) : (
            <p className="text-[10px] text-neutral-500">
              {progressRate !== null && progressRate <= 0
                ? 'Progressão estagnada — não é possível prever'
                : 'Dados insuficientes para previsão'
              }
            </p>
          )}

          {/* Mini history sparkline */}
          <div className="flex items-end gap-0.5 h-6">
            {history.slice(-10).map((h, i) => {
              const min = Math.min(...history.map(x => x.weight))
              const max = Math.max(...history.map(x => x.weight))
              const range = max - min || 1
              const pct = ((h.weight - min) / range) * 100
              return (
                <div
                  key={i}
                  className="flex-1 rounded-sm bg-amber-500/40"
                  style={{ height: `${Math.max(10, pct)}%` }}
                  title={`${h.date}: ${h.weight}${unit}`}
                />
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
