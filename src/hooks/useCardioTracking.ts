'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useGeoLocation, type GeoFix, type TrackingStatus } from './useGeoLocation'
import { totalTrackDistance, avgPaceMinKm, speedKmh, haversineDistance } from '@/utils/geoUtils'
import type { GeoTrackPoint } from '@/utils/geoUtils'
import { decideCardioFilter, estimateCardioCalories } from '@/utils/cardioFilters'
import {
  persistActiveCardio,
  recoverActiveCardio,
  clearPersistedCardio,
} from '@/lib/offline/cardioPersistence'
import { logWarn } from '@/lib/logger'
import { isIosNative, isAndroidNative } from '@/utils/platform'

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
  /**
   * Owner user id. When provided, the hook persists the live cardio state
   * to IDB (debounced + lifecycle flush) so a crash/kill mid-run can be
   * resumed. Without it, persistence is disabled and behavior is identical
   * to the legacy in-memory hook.
   */
  userId?: string | null
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
  /**
   * Snapshot of a previously-persisted cardio session found on mount.
   * Null when there's nothing to resume. The UI should show a "Retomar?"
   * banner while this is set AND `isTracking` is false.
   */
  recoveredCardio: Record<string, unknown> | null
  /** Restore the persisted state into the live hook and resume tracking. */
  resumeRecoveredCardio: () => Promise<void>
  /** Drop the persisted state and dismiss the banner. */
  discardRecoveredCardio: () => Promise<void>
  /** Force-clear the persisted cardio (e.g. after a successful server save). */
  finalizePersistedCardio: () => Promise<void>
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
  userId = null,
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

  // ── Persistence: dual-write to IDB so a kill mid-run doesn't lose data ──
  //
  // The cardio hook used to keep `trackPoints` + `metrics` in useState only,
  // with a single server save at `stop()`. App killed mid-run (iOS suspend,
  // low-memory kill, user swipes away) → 100% of the GPS trail gone. Now we
  // mirror `useLocalPersistence`'s strategy: debounce-write while running,
  // sync-flush on lifecycle pause, recover on next mount.

  const [recoveredCardio, setRecoveredCardio] = useState<Record<string, unknown> | null>(null)

  // Refs synced with state — used by the lifecycle flush listener that
  // doesn't re-bind on every tick, and by the stop()/callbacks below.
  const isTrackingRef = useRef(isTracking)
  const metricsRef = useRef(metrics)
  const userIdRef = useRef<string | null>(userId)
  useEffect(() => { isTrackingRef.current = isTracking }, [isTracking])
  useEffect(() => { metricsRef.current = metrics }, [metrics])
  useEffect(() => { userIdRef.current = userId }, [userId])

  // ── Recovery: check IDB on mount for a persisted run ───────────────────
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    recoverActiveCardio(userId)
      .then((state) => {
        if (cancelled || !state) return
        setRecoveredCardio(state)
      })
      .catch(() => { /* non-critical */ })
    return () => { cancelled = true }
  }, [userId])

  // ── Debounced IDB write while cardio is active ─────────────────────────
  //
  // "Active" detection: `isTracking === true` AND we have a startTimeRef
  // (i.e. start() was called and the clock is running). We persist even
  // while paused — pause is a temporary halt, not "no cardio". Discarding
  // paused state would lose a perfectly resumable run.
  const idbDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!userId) return
    if (!isTracking) return
    if (startTimeRef.current <= 0) return

    if (idbDebounceRef.current) clearTimeout(idbDebounceRef.current)
    const capturedUserId = userId
    idbDebounceRef.current = setTimeout(() => {
      persistActiveCardio(capturedUserId, {
        trackPoints,
        metrics,
        startedAt: startTimeRef.current,
        startedAtIso: startedAtRef.current,
        pausedDurationMs: pausedDurationRef.current,
        maxSpeedKmh: maxSpeedRef.current,
        isPaused,
        bodyWeightKg,
      }).catch(() => { /* best effort */ })
      idbDebounceRef.current = null
    }, 5000)

    // INTENCIONALMENTE NÃO cancela no cleanup — mesmo motivo do PR #99 em
    // useLocalPersistence: cleanup roda quando app é backgroundado, e
    // cancelar abortaria a escrita debounced. O re-run normal já chama
    // clearTimeout antes do novo setTimeout acima.
  }, [trackPoints, metrics, isTracking, isPaused, userId, bodyWeightKg])

  // ── Lifecycle flush — visibilitychange / pagehide / Capacitor pause ─────
  //
  // Espelha o listener de useLocalPersistence: quando o iOS/Android
  // suspende o WebView (user trocou de app, swipe-up, lock screen), o JS
  // para de rodar e o debounce de 5s acima não chega a disparar.
  // Aqui fazemos flush IMEDIATO (sem debounce) via persistActiveCardio.
  useEffect(() => {
    if (typeof window === 'undefined') return

    const flushImmediate = () => {
      const uid = userIdRef.current
      if (!uid) return
      if (!isTrackingRef.current) return
      if (startTimeRef.current <= 0) return
      const state: Record<string, unknown> = {
        trackPoints: trackPointsRef.current,
        metrics: metricsRef.current,
        startedAt: startTimeRef.current,
        startedAtIso: startedAtRef.current,
        pausedDurationMs: pausedDurationRef.current,
        maxSpeedKmh: maxSpeedRef.current,
      }
      persistActiveCardio(uid, state).catch(() => { /* best effort */ })
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushImmediate()
    }
    const onPageHide = () => flushImmediate()

    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('pagehide', onPageHide)

    // Capacitor App lifecycle — dynamic import so the web bundle stays slim
    let capListenerHandle: { remove: () => void } | null = null
    let capListenerCancelled = false
    if (isIosNative() || isAndroidNative()) {
      import('@capacitor/app').then(({ App }) => {
        if (capListenerCancelled) return
        App.addListener('appStateChange', (state: { isActive?: boolean }) => {
          if (!state?.isActive) flushImmediate()
        })
          .then((h) => {
            if (capListenerCancelled) { h.remove(); return }
            capListenerHandle = h
          })
          .catch((e) => logWarn('useCardioTracking.flush', 'capacitor listener add failed', e))
      }).catch((e) => logWarn('useCardioTracking.flush', 'capacitor import failed', e))
    }

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('pagehide', onPageHide)
      capListenerCancelled = true
      capListenerHandle?.remove()
    }
  }, [])

  // ── Recovery callbacks ─────────────────────────────────────────────────

  const resumeRecoveredCardio = useCallback(async () => {
    if (!recoveredCardio) return
    const points = Array.isArray(recoveredCardio.trackPoints)
      ? (recoveredCardio.trackPoints as GeoTrackPoint[])
      : []
    const startedAtMs = Number(recoveredCardio.startedAt || 0)
    if (!startedAtMs) return

    const recoveredMetrics = (recoveredCardio.metrics && typeof recoveredCardio.metrics === 'object')
      ? (recoveredCardio.metrics as CardioMetrics)
      : EMPTY_METRICS
    const pausedDurationMs = Number(recoveredCardio.pausedDurationMs || 0)
    const recoveredMaxSpeed = Number(recoveredCardio.maxSpeedKmh || 0)
    const recoveredStartedAtIso = typeof recoveredCardio.startedAtIso === 'string'
      ? recoveredCardio.startedAtIso
      : new Date(startedAtMs).toISOString()

    startTimeRef.current = startedAtMs
    pausedDurationRef.current = pausedDurationMs
    maxSpeedRef.current = recoveredMaxSpeed
    startedAtRef.current = recoveredStartedAtIso

    setTrackPoints(points)
    setMetrics(recoveredMetrics)
    setIsTracking(true)
    setIsPaused(false)
    setRecoveredCardio(null)
    await startWatching()
  }, [recoveredCardio, startWatching])

  const discardRecoveredCardio = useCallback(async () => {
    if (userId) await clearPersistedCardio(userId)
    setRecoveredCardio(null)
  }, [userId])

  const finalizePersistedCardio = useCallback(async () => {
    if (userId) await clearPersistedCardio(userId)
  }, [userId])

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
    recoveredCardio,
    resumeRecoveredCardio,
    discardRecoveredCardio,
    finalizePersistedCardio,
  }
}
