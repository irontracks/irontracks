'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useGeoLocation, type GeoFix, type TrackingStatus } from './useGeoLocation'
import { totalTrackDistance, avgPaceMinKm, speedKmh, haversineDistance } from '@/utils/geoUtils'
import type { GeoTrackPoint } from '@/utils/geoUtils'
import { decideCardioFilter, estimateCardioCalories } from '@/utils/cardioFilters'

interface CardioMetrics {
  /** Total distance in meters. */
  distanceMeters: number
  /** Elapsed time in seconds (excludes paused time). */
  durationSeconds: number
  /** Average pace in min/km, null if no distance yet. */
  paceMinKm: number | null
  /** Instantaneous speed in km/h (smoothed over the last segment). */
  currentSpeedKmh: number
  /** Peak speed in km/h recorded during the session. */
  maxSpeedKmh: number
  /** MET-based calorie estimate. */
  caloriesEstimated: number
  /** Current GPS accuracy in meters (null if no fix yet). Lower is better. */
  accuracyMeters: number | null
}

interface UseCardioTrackingOptions {
  /** Body weight in kg for accurate calorie calculation. Defaults to 75 kg. */
  bodyWeightKg?: number
  /**
   * Maximum GPS accuracy (in meters) for a point to be recorded.
   * Points with accuracy > this are dropped as unreliable. Default 30 m.
   */
  maxAccuracyMeters?: number
  /**
   * Minimum movement (in meters) between consecutive recorded points.
   * Sub-threshold moves are GPS drift while standing still. Default 5 m.
   */
  minMovementMeters?: number
  /**
   * Speed cap in km/h — segments faster than this are treated as GPS spikes
   * and the offending point is dropped. 45 km/h is well above any human
   * running or trail-biking pace but far below car speeds. Default 45.
   */
  maxRealisticSpeedKmh?: number
}

interface UseCardioTrackingResult {
  /** True between start() and stop()/reset(), pause included. */
  isTracking: boolean
  /** True while paused (timer frozen, GPS stopped). */
  isPaused: boolean
  /** Live metrics. */
  metrics: CardioMetrics
  /** Recorded route points (post-filter). */
  trackPoints: GeoTrackPoint[]
  /** Geolocation status from the underlying hook (drives UI). */
  gpsStatus: TrackingStatus
  /** Last user-facing geolocation error, or null. */
  gpsError: string | null
  /**
   * True when a GPS fix exists AND its accuracy is within
   * maxAccuracyMeters — i.e., we're getting usable points.
   */
  hasReliableFix: boolean
  start: () => Promise<void>
  pause: () => void
  resume: () => Promise<void>
  stop: () => {
    metrics: CardioMetrics
    points: GeoTrackPoint[]
    startedAt: string
    finishedAt: string
  } | null
  reset: () => void
}

const EMPTY_METRICS: CardioMetrics = {
  distanceMeters: 0,
  durationSeconds: 0,
  paceMinKm: null,
  currentSpeedKmh: 0,
  maxSpeedKmh: 0,
  caloriesEstimated: 0,
  accuracyMeters: null,
}

/** Convert a GeoFix into a GeoTrackPoint (trims fields we don't persist). */
function toTrackPoint(fix: GeoFix): GeoTrackPoint {
  return {
    latitude:  fix.latitude,
    longitude: fix.longitude,
    altitude:  fix.altitudeMeters ?? undefined,
    speed:     fix.speedMps ?? undefined,
    timestamp: fix.timestamp,
  }
}

/**
 * Cardio GPS tracking hook.
 *
 * Wraps useGeoLocation with workout-specific logic:
 *   - Accuracy gate (drop points with accuracy > maxAccuracyMeters).
 *   - Movement threshold (skip GPS drift while standing still).
 *   - Speed spike rejection (a bad fix that makes speed look like a car).
 *   - Pause/resume (timer tracks only active time).
 *   - MET-based calorie estimation.
 *
 * The hook surfaces the underlying GPS status/error so the UI can show
 * "aguardando GPS", "permission denied", or an inline error — instead of
 * the old behaviour where failures were silenced and the user saw nothing.
 */
export function useCardioTracking({
  bodyWeightKg = 75,
  maxAccuracyMeters = 30,
  minMovementMeters = 5,
  maxRealisticSpeedKmh = 45,
}: UseCardioTrackingOptions = {}): UseCardioTrackingResult {
  const {
    position,
    status: gpsStatus,
    error: gpsError,
    startWatching,
    stopWatching,
  } = useGeoLocation()

  const [isTracking, setIsTracking] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [metrics, setMetrics] = useState<CardioMetrics>(EMPTY_METRICS)
  const [trackPoints, setTrackPoints] = useState<GeoTrackPoint[]>([])

  const startTimeRef = useRef<number>(0)
  const pausedDurationRef = useRef<number>(0)
  const pauseStartRef = useRef<number>(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const maxSpeedRef = useRef<number>(0)
  const startedAtRef = useRef<string>('')
  // Hold the latest full GeoFix (including accuracy) for reading in effects
  // that otherwise only see GeoTrackPoint shape.
  const latestFixRef = useRef<GeoFix | null>(null)
  // Ref sincronizado com trackPoints — permite ler o último ponto sem stale
  // closure no effect de pipeline (que agora roda fora de setTrackPoints updater).
  const trackPointsRef = useRef<GeoTrackPoint[]>([])
  useEffect(() => { trackPointsRef.current = trackPoints }, [trackPoints])

  // ── Timer: advance elapsed + recompute pace/calories every second ────────
  useEffect(() => {
    if (!isTracking || isPaused) return
    timerRef.current = setInterval(() => {
      const elapsed = Math.floor(
        (Date.now() - startTimeRef.current - pausedDurationRef.current) / 1000,
      )
      setMetrics((prev) => ({
        ...prev,
        durationSeconds: elapsed,
        paceMinKm: avgPaceMinKm(prev.distanceMeters, elapsed),
        caloriesEstimated: estimateCardioCalories(prev.distanceMeters, elapsed, bodyWeightKg),
      }))
    }, 1000)
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [isTracking, isPaused, bodyWeightKg])

  // ── Position pipeline: filter + append + recompute ──────────────────────
  // Antes: setMetrics era chamado DENTRO do updater do setTrackPoints — anti-pattern.
  // Em StrictMode dupla execução, setMetrics rodaria 2x. Agora a lógica é puramente
  // computacional fora dos setStates: lê trackPoints via ref, decide, e chama
  // os 2 setStates em sequência.
  useEffect(() => {
    if (!isTracking || isPaused || !position) return
    latestFixRef.current = position

    const newPoint = toTrackPoint(position)
    const incoming = { ...newPoint, accuracyMeters: position.accuracyMeters }

    const prev = trackPointsRef.current
    const last = prev.length > 0 ? prev[prev.length - 1] : null
    const decision = decideCardioFilter(last, incoming, {
      maxAccuracyMeters,
      minMovementMeters,
      maxRealisticSpeedKmh,
    })

    if (decision.type === 'reject') {
      // Keep the accuracy visible so the UI can show signal quality and
      // "searching for GPS" while we wait for a good fix.
      setMetrics((p) => ({ ...p, accuracyMeters: position.accuracyMeters }))
      return
    }

    const updated = [...prev, newPoint]
    const totalDist = totalTrackDistance(updated)
    const elapsed = Math.floor(
      (Date.now() - startTimeRef.current - pausedDurationRef.current) / 1000,
    )

    // Current speed from the freshest segment
    let currentSpeed = 0
    if (updated.length >= 2) {
      const a = updated[updated.length - 1]
      const b = updated[updated.length - 2]
      const sd = haversineDistance(b, a)
      const st = (a.timestamp - b.timestamp) / 1000
      currentSpeed = st > 0 ? speedKmh(sd, st) : 0
    }
    if (currentSpeed > maxSpeedRef.current) maxSpeedRef.current = currentSpeed

    setTrackPoints(updated)
    setMetrics({
      distanceMeters: totalDist,
      durationSeconds: elapsed,
      paceMinKm: avgPaceMinKm(totalDist, elapsed),
      currentSpeedKmh: Math.round(currentSpeed * 10) / 10,
      maxSpeedKmh: Math.round(maxSpeedRef.current * 10) / 10,
      caloriesEstimated: estimateCardioCalories(totalDist, elapsed, bodyWeightKg),
      accuracyMeters: position.accuracyMeters,
    })
  }, [position, isTracking, isPaused, bodyWeightKg, maxAccuracyMeters, minMovementMeters, maxRealisticSpeedKmh])

  // ── Public API ──────────────────────────────────────────────────────────

  const start = useCallback(async () => {
    startTimeRef.current = Date.now()
    pausedDurationRef.current = 0
    maxSpeedRef.current = 0
    startedAtRef.current = new Date().toISOString()
    latestFixRef.current = null
    setTrackPoints([])
    setMetrics(EMPTY_METRICS)
    setIsTracking(true)
    setIsPaused(false)
    await startWatching()
  }, [startWatching])

  const pause = useCallback(() => {
    setIsPaused(true)
    pauseStartRef.current = Date.now()
    stopWatching()
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [stopWatching])

  const resume = useCallback(async () => {
    pausedDurationRef.current += Date.now() - pauseStartRef.current
    setIsPaused(false)
    await startWatching()
  }, [startWatching])

  const stop = useCallback(() => {
    stopWatching()
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    setIsTracking(false)
    setIsPaused(false)

    if (trackPoints.length === 0) return null

    const finishedAt = new Date().toISOString()
    return {
      metrics: { ...metrics },
      points: [...trackPoints],
      startedAt: startedAtRef.current,
      finishedAt,
    }
  }, [stopWatching, metrics, trackPoints])

  const reset = useCallback(() => {
    stopWatching()
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    setIsTracking(false)
    setIsPaused(false)
    setTrackPoints([])
    setMetrics(EMPTY_METRICS)
    maxSpeedRef.current = 0
    pausedDurationRef.current = 0
    latestFixRef.current = null
  }, [stopWatching])

  const hasReliableFix =
    !!position && position.accuracyMeters <= maxAccuracyMeters

  return {
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
  }
}
