'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useGeoLocation } from './useGeoLocation'
import { totalTrackDistance, avgPaceMinKm, speedKmh } from '@/utils/geoUtils'
import type { GeoTrackPoint } from '@/utils/geoUtils'

interface CardioMetrics {
  /** Total distance in meters */
  distanceMeters: number
  /** Elapsed time in seconds */
  durationSeconds: number
  /** Average pace in min/km (null if no distance) */
  paceMinKm: number | null
  /** Current speed in km/h */
  currentSpeedKmh: number
  /** Max speed recorded in km/h */
  maxSpeedKmh: number
  /** Estimated calories burned */
  caloriesEstimated: number
}

interface UseCardioTrackingResult {
  /** Whether tracking is active */
  isTracking: boolean
  /** Whether tracking is paused */
  isPaused: boolean
  /** Current real-time metrics */
  metrics: CardioMetrics
  /** All recorded track points */
  trackPoints: GeoTrackPoint[]
  /** Start GPS tracking */
  start: () => void
  /** Pause tracking (keeps timer but stops GPS) */
  pause: () => void
  /** Resume from pause */
  resume: () => void
  /** Stop tracking and return final data */
  stop: () => { metrics: CardioMetrics; points: GeoTrackPoint[]; startedAt: string; finishedAt: string } | null
  /** Reset all state */
  reset: () => void
}

const EMPTY_METRICS: CardioMetrics = {
  distanceMeters: 0,
  durationSeconds: 0,
  paceMinKm: null,
  currentSpeedKmh: 0,
  maxSpeedKmh: 0,
  caloriesEstimated: 0,
}

/**
 * Estimate calories from distance (meters) and duration (seconds).
 * Uses a rough MET-based formula: ~60 cal/km for running, ~40 cal/km for walking.
 * Threshold: > 8 km/h = running, else walking.
 */
function estimateCalories(distanceMeters: number, durationSeconds: number): number {
  if (distanceMeters <= 0 || durationSeconds <= 0) return 0
  const km = distanceMeters / 1000
  const speed = speedKmh(distanceMeters, durationSeconds)
  const calPerKm = speed > 8 ? 65 : 45
  return Math.round(km * calPerKm)
}

export function useCardioTracking(): UseCardioTrackingResult {
  const { startWatching, stopWatching, position, watching } = useGeoLocation()
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

  // Update metrics every second
  useEffect(() => {
    if (!isTracking || isPaused) return

    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTimeRef.current - pausedDurationRef.current) / 1000)
      setMetrics(prev => ({
        ...prev,
        durationSeconds: elapsed,
        paceMinKm: avgPaceMinKm(prev.distanceMeters, elapsed),
        caloriesEstimated: estimateCalories(prev.distanceMeters, elapsed),
      }))
    }, 1000)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [isTracking, isPaused])

  // Record new position when it changes
  useEffect(() => {
    if (!isTracking || isPaused || !position) return

    const newPoint: GeoTrackPoint = {
      latitude: position.latitude,
      longitude: position.longitude,
      timestamp: Date.now(),
    }

    setTrackPoints(prev => {
      const updated = [...prev, newPoint]
      const dist = totalTrackDistance(updated)
      const elapsed = Math.floor((Date.now() - startTimeRef.current - pausedDurationRef.current) / 1000)

      // Calculate current speed from last 2 points
      let currentSpeed = 0
      if (updated.length >= 2) {
        const last = updated[updated.length - 1]
        const prev2 = updated[updated.length - 2]
        const segDist = totalTrackDistance([prev2, last])
        const segTime = (last.timestamp - prev2.timestamp) / 1000
        currentSpeed = segTime > 0 ? speedKmh(segDist, segTime) : 0
      }

      if (currentSpeed > maxSpeedRef.current) maxSpeedRef.current = currentSpeed

      setMetrics({
        distanceMeters: dist,
        durationSeconds: elapsed,
        paceMinKm: avgPaceMinKm(dist, elapsed),
        currentSpeedKmh: Math.round(currentSpeed * 10) / 10,
        maxSpeedKmh: Math.round(maxSpeedRef.current * 10) / 10,
        caloriesEstimated: estimateCalories(dist, elapsed),
      })

      return updated
    })
  }, [position, isTracking, isPaused])

  const start = useCallback(() => {
    startTimeRef.current = Date.now()
    pausedDurationRef.current = 0
    maxSpeedRef.current = 0
    startedAtRef.current = new Date().toISOString()
    setTrackPoints([])
    setMetrics(EMPTY_METRICS)
    setIsTracking(true)
    setIsPaused(false)
    startWatching()
  }, [startWatching])

  const pause = useCallback(() => {
    setIsPaused(true)
    pauseStartRef.current = Date.now()
    stopWatching()
    if (timerRef.current) clearInterval(timerRef.current)
  }, [stopWatching])

  const resume = useCallback(() => {
    pausedDurationRef.current += Date.now() - pauseStartRef.current
    setIsPaused(false)
    startWatching()
  }, [startWatching])

  const stop = useCallback(() => {
    stopWatching()
    if (timerRef.current) clearInterval(timerRef.current)
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
    if (timerRef.current) clearInterval(timerRef.current)
    setIsTracking(false)
    setIsPaused(false)
    setTrackPoints([])
    setMetrics(EMPTY_METRICS)
    maxSpeedRef.current = 0
    pausedDurationRef.current = 0
  }, [stopWatching])

  return { isTracking, isPaused, metrics, trackPoints, start, pause, resume, stop, reset }
}
