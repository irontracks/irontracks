'use client'

import React, { memo, useCallback, useEffect, useState } from 'react'
import { Activity, Moon, Heart, TrendingUp } from 'lucide-react'
import { getRestingHeartRate, getHRV, isHealthKitAvailable } from '@/utils/native/irontracksNative'
import { isIosNative } from '@/utils/platform'

/* ──────────────────────────────────────────────────────────
 * RecoveryScore — readiness-to-train indicator
 *
 * Combines Apple Watch HRV + Resting HR to estimate
 * recovery/readiness. Shows a 0-100 score with
 * premium ring chart.
 *
 * Formula:
 * - HRV score: higher HRV = better recovery (40-80ms range mapped to 0-100)
 * - RHR score: lower resting HR = better recovery (50-80bpm range mapped to 100-0)
 * - Combined: 60% HRV + 40% RHR
 * ────────────────────────────────────────────────────────── */

type ReadinessLevel = 'ready' | 'moderate' | 'tired'

const LEVEL_CONFIG: Record<ReadinessLevel, { label: string; emoji: string; color: string; gradient: string }> = {
  ready:    { label: 'Pronto',   emoji: '🟢', color: '#34d399', gradient: 'conic-gradient(#34d399' },
  moderate: { label: 'Moderado', emoji: '🟡', color: '#fbbf24', gradient: 'conic-gradient(#fbbf24' },
  tired:    { label: 'Cansado',  emoji: '🔴', color: '#ef4444', gradient: 'conic-gradient(#ef4444' },
}

function getLevel(score: number): ReadinessLevel {
  if (score >= 70) return 'ready'
  if (score >= 40) return 'moderate'
  return 'tired'
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

function computeScore(hrv: number, rhr: number): number {
  // HRV: 20ms = 0, 80ms = 100 (higher is better)
  const hrvScore = clamp(((hrv - 20) / 60) * 100, 0, 100)
  // RHR: 80bpm = 0, 45bpm = 100 (lower is better)
  const rhrScore = clamp(((80 - rhr) / 35) * 100, 0, 100)
  return Math.round(hrvScore * 0.6 + rhrScore * 0.4)
}

const RecoveryScore = memo(function RecoveryScore() {
  const [score, setScore] = useState<number | null>(null)
  const [hrv, setHrv] = useState(0)
  const [rhr, setRhr] = useState(0)
  const [available, setAvailable] = useState(false)
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    try {
      if (!isIosNative()) { setLoading(false); return }
      const hkAvailable = await isHealthKitAvailable()
      if (!hkAvailable) { setLoading(false); return }

      const [hrvResult, rhrResult] = await Promise.all([getHRV(), getRestingHeartRate()])

      if (hrvResult.sdnn > 0 || rhrResult.bpm > 0) {
        setAvailable(true)
        const sdnn = hrvResult.sdnn > 0 ? hrvResult.sdnn : 50 // default if only RHR
        const restHR = rhrResult.bpm > 0 ? rhrResult.bpm : 65 // default if only HRV
        setHrv(Math.round(sdnn))
        setRhr(restHR)
        setScore(computeScore(sdnn, restHR))
      }
    } catch { /* silent */ }
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  if (loading || !available || score === null) return null

  const level = getLevel(score)
  const cfg = LEVEL_CONFIG[level]
  const pct = score / 100
  const circumference = 2 * Math.PI * 42 // radius=42
  const dashOffset = circumference * (1 - pct)

  return (
    <div
      className="rounded-2xl p-4 relative overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, rgba(15,15,12,0.95) 0%, rgba(10,10,10,0.98) 100%)',
        border: `1px solid ${cfg.color}15`,
      }}
    >
      {/* Top accent */}
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${cfg.color}20, transparent)` }}
      />

      <div className="flex items-center gap-4">
        {/* Ring chart */}
        <div className="relative shrink-0" style={{ width: 80, height: 80 }}>
          <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
            {/* Background ring */}
            <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="6" />
            {/* Score ring */}
            <circle
              cx="50" cy="50" r="42" fill="none"
              stroke={cfg.color}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              className="transition-all duration-1000"
              style={{ filter: `drop-shadow(0 0 4px ${cfg.color}40)` }}
            />
          </svg>
          {/* Score number */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-bold tabular-nums" style={{ color: cfg.color }}>
              {score}
            </span>
            <span className="text-[7px] uppercase tracking-wider text-neutral-600 font-medium">
              score
            </span>
          </div>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <Activity size={12} className="text-neutral-500" />
            <span className="text-[10px] font-semibold text-neutral-500 uppercase tracking-[0.15em]">
              Recuperação
            </span>
          </div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-bold" style={{ color: cfg.color }}>
              {cfg.emoji} {cfg.label} para treinar
            </span>
          </div>

          {/* HRV + RHR details */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <TrendingUp size={10} className="text-neutral-600" />
              <span className="text-[10px] text-neutral-500">
                HRV <span className="font-semibold text-neutral-400">{hrv}ms</span>
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Heart size={10} className="text-neutral-600" />
              <span className="text-[10px] text-neutral-500">
                FC rep <span className="font-semibold text-neutral-400">{rhr}bpm</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Apple Watch attribution */}
      <div className="mt-3 pt-2 border-t border-neutral-900">
        <span className="text-[8px] text-neutral-700 uppercase tracking-[0.2em]">
          ⌚ via Apple Watch · atualizado durante o sono
        </span>
      </div>
    </div>
  )
})

export default RecoveryScore
