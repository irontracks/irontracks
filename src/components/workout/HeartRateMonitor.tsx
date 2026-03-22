'use client'

import React, { memo, useCallback, useEffect, useRef, useState } from 'react'
import { Heart } from 'lucide-react'
import { getHeartRate } from '@/utils/native/irontracksNative'
import { isIosNative } from '@/utils/platform'

/* ──────────────────────────────────────────────────────────
 * HeartRateMonitor — Live heart rate from Apple Watch
 *
 * Polls HealthKit every 5s for latest HR sample.
 * Shows BPM + HR zone color + mini sparkline.
 * Only renders on iOS native with HealthKit available.
 * ────────────────────────────────────────────────────────── */

type HRZone = 'rest' | 'warmup' | 'fat_burn' | 'cardio' | 'peak'

const ZONE_CONFIG: Record<HRZone, { label: string; color: string; bg: string }> = {
  rest:     { label: 'Repouso',  color: '#6ee7b7', bg: 'rgba(110,231,183,0.10)' },
  warmup:   { label: 'Leve',     color: '#93c5fd', bg: 'rgba(147,197,253,0.10)' },
  fat_burn: { label: 'Queima',   color: '#fbbf24', bg: 'rgba(251,191,36,0.10)' },
  cardio:   { label: 'Cardio',   color: '#f97316', bg: 'rgba(249,115,22,0.10)' },
  peak:     { label: 'Máximo',   color: '#ef4444', bg: 'rgba(239,68,68,0.10)' },
}

function getZone(bpm: number, maxHR: number): HRZone {
  const pct = bpm / maxHR
  if (pct < 0.50) return 'rest'
  if (pct < 0.60) return 'warmup'
  if (pct < 0.70) return 'fat_burn'
  if (pct < 0.85) return 'cardio'
  return 'peak'
}

interface Props {
  age?: number // for max HR calculation  
}

const MAX_HISTORY = 20

const HeartRateMonitor = memo(function HeartRateMonitor({ age = 30 }: Props) {
  const [bpm, setBpm] = useState(0)
  const [history, setHistory] = useState<number[]>([])
  const [available, setAvailable] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const maxHR = 220 - age

  const poll = useCallback(async () => {
    try {
      const result = await getHeartRate()
      if (result.bpm > 0) {
        // Only count if sample is recent (within last 60s)
        const ageMs = Date.now() - result.timestamp
        if (ageMs < 60_000) {
          setBpm(result.bpm)
          setHistory(prev => [...prev.slice(-(MAX_HISTORY - 1)), result.bpm])
          if (!available) setAvailable(true)
        }
      }
    } catch { /* silent */ }
  }, [available])

  useEffect(() => {
    if (!isIosNative()) return
    poll() // initial
    intervalRef.current = setInterval(poll, 5000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [poll])

  if (!available || bpm === 0) return null

  const zone = getZone(bpm, maxHR)
  const cfg = ZONE_CONFIG[zone]

  // Mini sparkline path
  const sparkline = history.length > 1
    ? history.map((v, i) => {
        const x = (i / (MAX_HISTORY - 1)) * 100
        const minH = Math.min(...history) - 5
        const maxH = Math.max(...history) + 5
        const y = 100 - ((v - minH) / (maxH - minH)) * 100
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`
      }).join(' ')
    : null

  return (
    <div
      className="flex items-center gap-3 rounded-xl px-3 py-2"
      style={{ background: cfg.bg, border: `1px solid ${cfg.color}15` }}
    >
      {/* Pulsing heart icon */}
      <div className="relative shrink-0">
        <Heart
          size={18}
          fill={cfg.color}
          color={cfg.color}
          className="animate-pulse"
        />
      </div>

      {/* BPM value */}
      <div className="flex items-baseline gap-1">
        <span className="text-lg font-bold tabular-nums" style={{ color: cfg.color }}>
          {bpm}
        </span>
        <span className="text-[9px] uppercase tracking-wider" style={{ color: `${cfg.color}80` }}>
          bpm
        </span>
      </div>

      {/* Zone badge */}
      <span
        className="text-[8px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
        style={{ background: `${cfg.color}15`, color: cfg.color }}
      >
        {cfg.label}
      </span>

      {/* Mini sparkline */}
      {sparkline && (
        <svg viewBox="0 0 100 100" className="w-12 h-5 shrink-0" preserveAspectRatio="none">
          <path d={sparkline} fill="none" stroke={cfg.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity={0.6} />
        </svg>
      )}
    </div>
  )
})

export default HeartRateMonitor
