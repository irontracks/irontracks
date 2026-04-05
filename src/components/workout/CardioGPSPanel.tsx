'use client'

import { useCallback, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useCardioTracking } from '@/hooks/useCardioTracking'
import { formatDistance, formatPace } from '@/utils/geoUtils'

// MapLibre GL needs browser APIs (WebGL) — load client-side only
const RouteMapLeaflet = dynamic(() => import('./RouteMapLeaflet'), { ssr: false })

interface CardioGPSPanelProps {
  /** If provided, links the track to a workout */
  workoutId?: string
  /** Called after saving the track */
  onSaved?: (trackId: string) => void
  /** Body weight in kg for accurate calorie calculation */
  bodyWeightKg?: number
}

/** Format seconds as "HH:MM:SS" or "MM:SS" */
function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function CardioGPSPanel({ workoutId, onSaved, bodyWeightKg }: CardioGPSPanelProps) {
  const { isTracking, isPaused, metrics, trackPoints, start, pause, resume, stop, reset } = useCardioTracking({ bodyWeightKg })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  // Collapsed by default — auto-expands when tracking starts
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    if (isTracking) setIsOpen(true)
  }, [isTracking])

  const handleStop = useCallback(async () => {
    const result = stop()
    if (!result) return

    setSaving(true)
    try {
      const resp = await fetch('/api/gps/cardio/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workout_id: workoutId || null,
          distance_meters: result.metrics.distanceMeters,
          duration_seconds: result.metrics.durationSeconds,
          avg_pace_min_km: result.metrics.paceMinKm,
          max_speed_kmh: result.metrics.maxSpeedKmh,
          calories_estimated: result.metrics.caloriesEstimated,
          route: result.points.map(p => ({
            lat: p.latitude,
            lng: p.longitude,
            ts: p.timestamp,
            alt: p.altitude || null,
          })),
          started_at: result.startedAt,
          finished_at: result.finishedAt,
        }),
      })
      const data = await resp.json()
      if (data.ok && data.track?.id) {
        setSaved(true)
        onSaved?.(data.track.id)
      }
    } catch {
      // intentional: save failures are non-critical during workout
    } finally {
      setSaving(false)
    }
  }, [stop, workoutId, onSaved])

  const handleReset = useCallback(() => {
    reset()
    setSaved(false)
  }, [reset])

  return (
    <div
      className="mx-4 rounded-2xl border overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, rgba(15,15,15,0.98) 0%, rgba(10,20,15,0.98) 100%)',
        borderColor: isTracking ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.08)',
      }}
    >
      {/* Accordion header — always visible */}
      <button
        type="button"
        onClick={() => setIsOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-base">🏃</span>
          <span className="text-sm font-bold text-white">Cardio GPS</span>
          {isTracking && (
            <div className="flex items-center gap-1.5">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{
                  background: isPaused ? '#eab308' : '#22c55e',
                  animation: isPaused ? 'none' : 'gps-pulse 1.5s ease-in-out infinite',
                }}
              />
              <span className="text-xs text-white/50">{isPaused ? 'Pausado' : 'Gravando'}</span>
            </div>
          )}
        </div>
        {isOpen
          ? <ChevronUp size={15} className="text-neutral-500" />
          : <ChevronDown size={15} className="text-neutral-500" />
        }
      </button>

      {/* Collapsible content */}
      {isOpen && (
        <div className="px-4 pb-4">
          {/* Route Map — Leaflet with dark tiles (Strava-style) */}
          <RouteMapLeaflet points={trackPoints} height={200} live={isTracking} />

          {/* Metrics Grid */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            <MetricCard label="Distância" value={formatDistance(metrics.distanceMeters)} accent />
            <MetricCard label="Tempo" value={formatDuration(metrics.durationSeconds)} />
            <MetricCard label="Pace" value={formatPace(metrics.paceMinKm)} unit="/km" />
            <MetricCard label="Velocidade" value={`${metrics.currentSpeedKmh}`} unit="km/h" />
            <MetricCard label="Max" value={`${metrics.maxSpeedKmh}`} unit="km/h" />
            <MetricCard label="Calorias" value={`${metrics.caloriesEstimated}`} unit="kcal" />
          </div>

          {/* Controls */}
          <div className="flex gap-2">
            {!isTracking && !saved ? (
              <button
                onClick={start}
                className="flex-1 rounded-xl py-3 text-sm font-bold text-black transition-all active:scale-95"
                style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)' }}
              >
                ▶ Iniciar Cardio
              </button>
            ) : isTracking ? (
              <>
                <button
                  onClick={isPaused ? resume : pause}
                  className="flex-1 rounded-xl py-3 text-sm font-bold text-black transition-all active:scale-95"
                  style={{ background: isPaused ? 'linear-gradient(135deg, #22c55e, #16a34a)' : 'linear-gradient(135deg, #eab308, #ca8a04)' }}
                >
                  {isPaused ? '▶ Retomar' : '⏸ Pausar'}
                </button>
                <button
                  onClick={handleStop}
                  disabled={saving}
                  className="rounded-xl border px-5 py-3 text-sm font-bold text-red-400 transition-all active:scale-95 disabled:opacity-50"
                  style={{ borderColor: 'rgba(239,68,68,0.3)' }}
                >
                  {saving ? '...' : '⏹ Parar'}
                </button>
              </>
            ) : saved ? (
              <div className="flex-1 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-green-400">✓</span>
                  <span className="text-sm text-white/60">Cardio salvo!</span>
                </div>
                <button
                  onClick={handleReset}
                  className="rounded-lg px-3 py-1.5 text-xs text-white/40 hover:text-white transition-colors"
                  style={{ background: 'rgba(255,255,255,0.05)' }}
                >
                  Novo
                </button>
              </div>
            ) : null}
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes gps-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  )
}

function MetricCard({ label, value, unit, accent }: { label: string; value: string; unit?: string; accent?: boolean }) {
  return (
    <div
      className="rounded-xl p-2 text-center"
      style={{
        background: accent ? 'rgba(34,197,94,0.08)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${accent ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.05)'}`,
      }}
    >
      <p className="text-xs text-white/40">{label}</p>
      <p className={`text-base font-bold ${accent ? 'text-green-400' : 'text-white'}`}>
        {value}
        {unit && <span className="text-xs text-white/30 ml-0.5">{unit}</span>}
      </p>
    </div>
  )
}
