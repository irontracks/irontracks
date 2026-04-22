'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronUp, MapPin, Satellite } from 'lucide-react'
import { useCardioTracking } from '@/hooks/useCardioTracking'
import { formatDistance, formatPace } from '@/utils/geoUtils'
import RouteMapLeaflet from './RouteMapLeaflet'

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

/** Human-readable GPS signal bucket based on accuracy (in meters). */
function gpsSignalLabel(accuracy: number | null): { label: string; color: string } {
  if (accuracy === null) return { label: 'Sem sinal', color: '#6b7280' }
  if (accuracy <= 10) return { label: 'Excelente', color: '#22c55e' }
  if (accuracy <= 20) return { label: 'Bom', color: '#84cc16' }
  if (accuracy <= 30) return { label: 'Aceit\u00e1vel', color: '#eab308' }
  return { label: 'Fraco', color: '#ef4444' }
}

export default function CardioGPSPanel({ workoutId, onSaved, bodyWeightKg }: CardioGPSPanelProps) {
  const {
    isTracking,
    isPaused,
    metrics,
    trackPoints,
    gpsStatus,
    gpsError,
    hasReliableFix,
    start,
    pause,
    resume,
    stop,
    reset,
  } = useCardioTracking({ bodyWeightKg })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  // Collapsed by default \u2014 auto-expands when tracking starts
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    if (isTracking) setIsOpen(true)
  }, [isTracking])

  const handleStart = useCallback(() => {
    setSaveError(null)
    void start()
  }, [start])

  const handleResume = useCallback(() => {
    void resume()
  }, [resume])

  const handleStop = useCallback(async () => {
    const result = stop()
    if (!result) return

    setSaving(true)
    setSaveError(null)
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
          route: result.points.map((p) => ({
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
      } else {
        setSaveError('N\u00e3o foi poss\u00edvel salvar a rota. Tente novamente.')
      }
    } catch {
      setSaveError('N\u00e3o foi poss\u00edvel salvar a rota. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }, [stop, workoutId, onSaved])

  const handleReset = useCallback(() => {
    reset()
    setSaved(false)
    setSaveError(null)
  }, [reset])

  // Derived UI state
  const gpsIsDenied = gpsStatus === 'denied'
  const gpsIsUnavailable = gpsStatus === 'unavailable'
  const gpsIsAcquiring =
    isTracking && (gpsStatus === 'requesting-permission' || gpsStatus === 'acquiring' || !hasReliableFix)
  const startDisabled = gpsIsDenied || gpsIsUnavailable
  const signal = gpsSignalLabel(metrics.accuracyMeters)

  return (
    <div
      className="mx-4 rounded-2xl border overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, rgba(15,15,15,0.98) 0%, rgba(10,20,15,0.98) 100%)',
        borderColor: isTracking ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.08)',
      }}
    >
      {/* Accordion header \u2014 always visible */}
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-base">\ud83c\udfc3</span>
          <span className="text-sm font-bold text-white">Cardio GPS</span>
          {isTracking && (
            <div className="flex items-center gap-1.5">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{
                  background: isPaused ? '#eab308' : hasReliableFix ? '#22c55e' : '#6b7280',
                  animation: isPaused || !hasReliableFix ? 'none' : 'gps-pulse 1.5s ease-in-out infinite',
                }}
              />
              <span className="text-xs text-white/50">
                {isPaused ? 'Pausado' : hasReliableFix ? 'Gravando' : 'Buscando GPS'}
              </span>
            </div>
          )}
        </div>
        {isOpen ? (
          <ChevronUp size={15} className="text-neutral-500" />
        ) : (
          <ChevronDown size={15} className="text-neutral-500" />
        )}
      </button>

      {/* Collapsible content */}
      {isOpen && (
        <div className="px-4 pb-4">
          {/* GPS state banners \u2014 shown before the map so user understands why */}
          {gpsIsDenied && (
            <div
              className="mb-3 flex items-start gap-2 rounded-xl p-3"
              style={{
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.3)',
              }}
            >
              <AlertTriangle size={16} className="mt-0.5 flex-shrink-0 text-red-400" />
              <div className="text-xs text-white/80">
                <p className="font-bold text-red-400">GPS bloqueado</p>
                <p className="mt-0.5 text-white/60">
                  {gpsError ??
                    'Permiss\u00e3o de localiza\u00e7\u00e3o negada. Ative o GPS para o IronTracks nas configura\u00e7\u00f5es do seu dispositivo.'}
                </p>
              </div>
            </div>
          )}
          {gpsIsUnavailable && (
            <div
              className="mb-3 flex items-start gap-2 rounded-xl p-3"
              style={{
                background: 'rgba(107,114,128,0.1)',
                border: '1px solid rgba(107,114,128,0.3)',
              }}
            >
              <AlertTriangle size={16} className="mt-0.5 flex-shrink-0 text-neutral-400" />
              <div className="text-xs text-white/80">
                <p className="font-bold text-neutral-300">GPS indispon\u00edvel</p>
                <p className="mt-0.5 text-white/60">
                  Este dispositivo n\u00e3o possui GPS ou a API de localiza\u00e7\u00e3o n\u00e3o est\u00e1 dispon\u00edvel.
                </p>
              </div>
            </div>
          )}
          {gpsError && !gpsIsDenied && !gpsIsUnavailable && (
            <div
              className="mb-3 flex items-start gap-2 rounded-xl p-3"
              style={{
                background: 'rgba(234,179,8,0.08)',
                border: '1px solid rgba(234,179,8,0.3)',
              }}
            >
              <AlertTriangle size={16} className="mt-0.5 flex-shrink-0 text-yellow-400" />
              <div className="text-xs text-white/80">
                <p className="font-bold text-yellow-400">Aten\u00e7\u00e3o</p>
                <p className="mt-0.5 text-white/60">{gpsError}</p>
              </div>
            </div>
          )}

          {/* GPS signal indicator \u2014 live during tracking */}
          {isTracking && !gpsIsDenied && !gpsIsUnavailable && (
            <div className="mb-3 flex items-center justify-between rounded-xl px-3 py-2"
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.05)',
              }}
            >
              <div className="flex items-center gap-2">
                <Satellite size={14} style={{ color: signal.color }} />
                <span className="text-xs text-white/60">Sinal GPS</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold" style={{ color: signal.color }}>
                  {signal.label}
                </span>
                {metrics.accuracyMeters !== null && (
                  <span className="text-xs text-white/40">
                    \u00b1{Math.round(metrics.accuracyMeters)}m
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Save error banner */}
          {saveError && (
            <div
              className="mb-3 flex items-start gap-2 rounded-xl p-3"
              style={{
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.3)',
              }}
            >
              <AlertTriangle size={16} className="mt-0.5 flex-shrink-0 text-red-400" />
              <span className="text-xs text-white/80">{saveError}</span>
            </div>
          )}

          {/* Route Map \u2014 Leaflet with dark tiles (Strava-style) */}
          <RouteMapLeaflet points={trackPoints} height={200} live={isTracking} acquiring={gpsIsAcquiring} />

          {/* Metrics Grid */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            <MetricCard label="Dist\u00e2ncia" value={formatDistance(metrics.distanceMeters)} accent />
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
                onClick={handleStart}
                disabled={startDisabled}
                className="flex-1 rounded-xl py-3 text-sm font-bold text-black transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                style={{
                  background: startDisabled
                    ? 'rgba(107,114,128,0.5)'
                    : 'linear-gradient(135deg, #22c55e, #16a34a)',
                }}
              >
                {startDisabled ? (
                  <span className="inline-flex items-center gap-2">
                    <MapPin size={14} /> GPS indispon\u00edvel
                  </span>
                ) : (
                  '\u25b6 Iniciar Cardio'
                )}
              </button>
            ) : isTracking ? (
              <>
                <button
                  onClick={isPaused ? handleResume : pause}
                  className="flex-1 rounded-xl py-3 text-sm font-bold text-black transition-all active:scale-95"
                  style={{
                    background: isPaused
                      ? 'linear-gradient(135deg, #22c55e, #16a34a)'
                      : 'linear-gradient(135deg, #eab308, #ca8a04)',
                  }}
                >
                  {isPaused ? '\u25b6 Retomar' : '\u23f8 Pausar'}
                </button>
                <button
                  onClick={handleStop}
                  disabled={saving}
                  className="rounded-xl border px-5 py-3 text-sm font-bold text-red-400 transition-all active:scale-95 disabled:opacity-50"
                  style={{ borderColor: 'rgba(239,68,68,0.3)' }}
                >
                  {saving ? '...' : '\u23f9 Parar'}
                </button>
              </>
            ) : saved ? (
              <div className="flex-1 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-green-400">\u2713</span>
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

function MetricCard({
  label,
  value,
  unit,
  accent,
}: {
  label: string
  value: string
  unit?: string
  accent?: boolean
}) {
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
