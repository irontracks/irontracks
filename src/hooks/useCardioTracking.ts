'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useGeoLocation, type GeoFix, type TrackingStatus } from './useGeoLocation'
import { avgPaceMinKm, speedKmh, haversineDistance } from '@/utils/geoUtils'
import type { GeoTrackPoint } from '@/utils/geoUtils'
import { decideCardioFilter, estimateCardioCalories } from '@/utils/cardioFilters'
import {
  persistActiveCardio,
  recoverActiveCardio,
  clearPersistedCardio,
} from '@/lib/offline/cardioPersistence'
import { logWarn } from '@/lib/logger'
import { isIosNative, isAndroidNative } from '@/utils/platform'
import {
  isNativeCardioLocationAvailable,
  startNativeCardioLocation,
  stopNativeCardioLocation,
  drainNativeCardioLocations,
  type NativeCardioFix,
} from '@/utils/native/irontracksNative'

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
  /**
   * True when the native background tracker is active (iOS). Nesse modo o GPS
   * NÃO pausa em segundo plano — a UI deve esconder o aviso "mantenha o app aberto".
   */
  isBackgroundTracking: boolean
  start: () => Promise<void>
  pause: () => void
  resume: () => Promise<void>
  stop: () => Promise<{
    metrics: CardioMetrics
    points: GeoTrackPoint[]
    startedAt: string
    finishedAt: string
  } | null>
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

/** Convert a native cardio fix (buffered by CLLocationManager) into a GeoFix. */
function mapNativeFix(p: NativeCardioFix): GeoFix {
  return {
    latitude: p.lat,
    longitude: p.lng,
    // accuracy negativa/NaN vira 99 (será rejeitada pelo gate de precisão).
    accuracyMeters: Number.isFinite(p.accuracy) && p.accuracy >= 0 ? p.accuracy : 99,
    altitudeMeters: Number.isFinite(p.altitude) ? p.altitude : null,
    speedMps: Number.isFinite(p.speed) && p.speed >= 0 ? p.speed : null,
    headingDeg: Number.isFinite(p.heading) && p.heading >= 0 ? p.heading : null,
    timestamp: Number(p.timestamp) > 0 ? Number(p.timestamp) : Date.now(),
  }
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
  // Distância acumulada em metros (incremental — não recomputa o array inteiro
  // a cada fix). Somar por segmento permite PULAR a "ponte" da pausa/recuperação.
  const distanceRef = useRef<number>(0)
  // Marca o próximo fix aceito como novo início de trecho: o deslocamento feito
  // DURANTE a pausa (ou com o app morto) NÃO deve entrar na distância.
  const justResumedRef = useRef<boolean>(false)
  const startedAtRef = useRef<string>('')
  // Hold the latest full GeoFix (including accuracy) for reading in effects
  // that otherwise only see GeoTrackPoint shape.
  const latestFixRef = useRef<GeoFix | null>(null)
  // Ref sincronizado com trackPoints — permite ler o último ponto sem stale
  // closure no effect de pipeline (que agora roda fora de setTrackPoints updater).
  const trackPointsRef = useRef<GeoTrackPoint[]>([])
  useEffect(() => { trackPointsRef.current = trackPoints }, [trackPoints])

  // ── Native background GPS (iOS) ────────────────────────────────────────────
  // Quando disponível, o cardio usa o CLLocationManager nativo (background +
  // buffer) em vez do @capacitor/geolocation. `usingNativeRef` diz qual caminho
  // está ativo; o timer drena o buffer nativo; `drainNativeRef` dá acesso à
  // função de drenagem pros listeners de lifecycle sem re-bind.
  const usingNativeRef = useRef(false)
  const nativeDrainTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const drainNativeRef = useRef<(() => Promise<void>) | null>(null)
  // Espelho em STATE do path nativo — o ref não dispara re-render, mas a UI precisa
  // saber que está no nativo pra: (a) surfaçar gpsStatus/hasReliableFix pelo caminho
  // certo (o useGeoLocation fica dormente no nativo), (b) esconder o aviso de "GPS
  // pausa em segundo plano" (falso no nativo).
  const [usingNativeGps, setUsingNativeGps] = useState(false)

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

  // ── Ingest pipeline: filtra + acumula + recomputa ────────────────────────
  // Processa 1 fix (web: `position`) OU um LOTE (nativo: buffer drenado no resume).
  // Percorre os fixes em ordem, aplica o filtro por segmento e faz UM setState no
  // fim. Escreve nos refs (distance/maxSpeed/trackPoints) de forma síncrona pra
  // que stop() leia o total correto mesmo logo após um drain assíncrono.
  const ingestFixes = useCallback((fixes: GeoFix[]) => {
    if (!fixes.length) return

    let points = trackPointsRef.current
    let appended = 0
    let lastAccuracy: number | null = null
    let currentSpeed = 0

    for (const fix of fixes) {
      latestFixRef.current = fix
      const newPoint = toTrackPoint(fix)
      const incoming = { ...newPoint, accuracyMeters: fix.accuracyMeters }
      const last = points.length > 0 ? points[points.length - 1] : null
      const decision = decideCardioFilter(last, incoming, {
        maxAccuracyMeters,
        minMovementMeters,
        maxRealisticSpeedKmh,
      })
      lastAccuracy = fix.accuracyMeters
      if (decision.type === 'reject') continue

      // 1º fix após retomar/recuperar é "ponte": não conta o deslocamento da pausa.
      const isBridge = justResumedRef.current
      if (isBridge) justResumedRef.current = false

      if (last && !isBridge) {
        const seg = haversineDistance(last, newPoint)
        const st = (newPoint.timestamp - last.timestamp) / 1000
        // Velocidade: prefere a do DISPOSITIVO (Doppler — CLLocationManager.speed),
        // que não tem os spikes da velocidade derivada de posição (ex.: "Max 45 km/h"
        // numa caminhada por um pulo de GPS). Fallback: computa do segmento (web).
        const deviceKmh = fix.speedMps != null && fix.speedMps >= 0 ? fix.speedMps * 3.6 : null
        const spd = deviceKmh != null ? deviceKmh : (st > 0 ? speedKmh(seg, st) : 0)
        currentSpeed = spd
        // Só conta como máx. se for plausível (< maxRealisticSpeedKmh) — blinda o
        // display contra qualquer pico residual.
        if (spd > maxSpeedRef.current && spd <= maxRealisticSpeedKmh) maxSpeedRef.current = spd
        distanceRef.current += seg
      }
      points = [...points, newPoint]
      appended++
    }

    if (appended === 0) {
      // Todos rejeitados — ainda mostra a precisão pra UI sinalizar qualidade/GPS fraco.
      if (lastAccuracy != null) setMetrics((p) => ({ ...p, accuracyMeters: lastAccuracy }))
      return
    }

    trackPointsRef.current = points
    const totalDist = distanceRef.current
    const elapsed = Math.floor(
      (Date.now() - startTimeRef.current - pausedDurationRef.current) / 1000,
    )

    setTrackPoints(points)
    setMetrics({
      distanceMeters: totalDist,
      durationSeconds: elapsed,
      paceMinKm: avgPaceMinKm(totalDist, elapsed),
      currentSpeedKmh: Math.round(currentSpeed * 10) / 10,
      maxSpeedKmh: Math.round(maxSpeedRef.current * 10) / 10,
      caloriesEstimated: estimateCardioCalories(totalDist, elapsed, bodyWeightKg),
      accuracyMeters: lastAccuracy,
    })
  }, [bodyWeightKg, maxAccuracyMeters, minMovementMeters, maxRealisticSpeedKmh])

  // Web path: cada `position` novo entra no pipeline (no-op quando o path nativo
  // está ativo, pois startWatching não é chamado e position fica null).
  useEffect(() => {
    if (!isTracking || isPaused || !position) return
    ingestFixes([position])
  }, [position, isTracking, isPaused, ingestFixes])

  // ── Native drain: buffer nativo → pipeline ───────────────────────────────
  const drainNative = useCallback(async () => {
    if (!usingNativeRef.current) return
    let raw: NativeCardioFix[] = []
    try { raw = await drainNativeCardioLocations() } catch { return }
    if (!raw.length) return
    ingestFixes(raw.map(mapNativeFix))
  }, [ingestFixes])
  useEffect(() => { drainNativeRef.current = drainNative }, [drainNative])

  // Drena o buffer nativo IMEDIATAMENTE quando o app volta ao foreground — os
  // pontos capturados enquanto o WebView estava suspenso (tela bloqueada/bolso)
  // entram no pipeline na hora, sem esperar o timer de 2s. Também para o tracking
  // nativo no unmount (fechar a tela por gesto) pra não deixar GPS/bateria ligados.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onResume = () => { void drainNativeRef.current?.() }
    const onVisibility = () => { if (document.visibilityState === 'visible') onResume() }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pageshow', onResume)

    let capHandle: { remove: () => void } | null = null
    let capCancelled = false
    if (isIosNative()) {
      import('@capacitor/app').then(({ App }) => {
        if (capCancelled) return
        App.addListener('appStateChange', (state: { isActive?: boolean }) => {
          if (state?.isActive) onResume()
        })
          .then((h) => { if (capCancelled) { h.remove(); return } capHandle = h })
          .catch((e) => logWarn('useCardioTracking.nativeResume', 'listener add failed', e))
      }).catch((e) => logWarn('useCardioTracking.nativeResume', 'import failed', e))
    }

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pageshow', onResume)
      capCancelled = true
      capHandle?.remove()
      // Unmount: garante que o GPS nativo não fique ligado se a tela foi fechada
      // sem passar por stop()/reset() (ex.: gesto de voltar).
      if (nativeDrainTimerRef.current) {
        clearInterval(nativeDrainTimerRef.current)
        nativeDrainTimerRef.current = null
      }
      if (usingNativeRef.current) {
        usingNativeRef.current = false
        void stopNativeCardioLocation()
      }
    }
  }, [])

  const startNative = useCallback(async (): Promise<boolean> => {
    const res = await startNativeCardioLocation()
    if (!res.ok) return false
    usingNativeRef.current = true
    setUsingNativeGps(true)
    if (nativeDrainTimerRef.current) clearInterval(nativeDrainTimerRef.current)
    // Drena a cada 2s enquanto o app está em foreground (o timer congela em
    // background junto com o JS; o buffer nativo continua enchendo e é drenado no
    // resume). 2s é folgado pra corrida e barato.
    nativeDrainTimerRef.current = setInterval(() => { void drainNative() }, 2000)
    return true
  }, [drainNative])

  const stopNative = useCallback(async () => {
    if (!usingNativeRef.current) return
    usingNativeRef.current = false
    setUsingNativeGps(false)
    if (nativeDrainTimerRef.current) {
      clearInterval(nativeDrainTimerRef.current)
      nativeDrainTimerRef.current = null
    }
    let raw: NativeCardioFix[] = []
    try { raw = await stopNativeCardioLocation() } catch { /* best effort */ }
    if (raw.length) ingestFixes(raw.map(mapNativeFix))
  }, [ingestFixes])

  // ── Public API ──────────────────────────────────────────────────────────

  const start = useCallback(async () => {
    startTimeRef.current = Date.now()
    pausedDurationRef.current = 0
    pauseStartRef.current = 0
    maxSpeedRef.current = 0
    distanceRef.current = 0
    justResumedRef.current = false
    startedAtRef.current = new Date().toISOString()
    latestFixRef.current = null
    setTrackPoints([])
    setMetrics(EMPTY_METRICS)
    setIsTracking(true)
    setIsPaused(false)
    // Nativo primeiro (background real). Se indisponível/negado, cai no web watch —
    // que também surfaça o erro de permissão pra UI.
    if (isNativeCardioLocationAvailable() && (await startNative())) return
    await startWatching()
  }, [startWatching, startNative])

  const pause = useCallback(() => {
    if (pauseStartRef.current > 0) return // já pausado — idempotente
    setIsPaused(true)
    pauseStartRef.current = Date.now()
    if (usingNativeRef.current) { void stopNative() } else { stopWatching() }
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [stopWatching, stopNative])

  const resume = useCallback(async () => {
    if (pauseStartRef.current === 0) return // não estava pausado — idempotente
    pausedDurationRef.current += Date.now() - pauseStartRef.current
    pauseStartRef.current = 0
    // Não conta o deslocamento feito durante a pausa como distância percorrida.
    justResumedRef.current = true
    setIsPaused(false)
    if (isNativeCardioLocationAvailable() && (await startNative())) return
    await startWatching()
  }, [startWatching, startNative])

  const stop = useCallback(async () => {
    // Nativo: para + drena o buffer final ANTES de montar o resultado (senão os
    // últimos segundos de pontos ficam de fora). O resultado é computado dos REFS
    // (não do state), pois o drain é assíncrono e o setState não reflete na hora.
    if (usingNativeRef.current) { await stopNative() } else { stopWatching() }
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    setIsTracking(false)
    setIsPaused(false)

    const points = trackPointsRef.current
    if (points.length === 0) return null

    const totalDist = distanceRef.current
    const elapsed = Math.floor(
      (Date.now() - startTimeRef.current - pausedDurationRef.current) / 1000,
    )
    const finalMetrics: CardioMetrics = {
      distanceMeters: totalDist,
      durationSeconds: elapsed,
      paceMinKm: avgPaceMinKm(totalDist, elapsed),
      currentSpeedKmh: 0,
      maxSpeedKmh: Math.round(maxSpeedRef.current * 10) / 10,
      caloriesEstimated: estimateCardioCalories(totalDist, elapsed, bodyWeightKg),
      accuracyMeters: latestFixRef.current?.accuracyMeters ?? null,
    }
    const finishedAt = new Date().toISOString()
    return {
      metrics: finalMetrics,
      points: [...points],
      startedAt: startedAtRef.current,
      finishedAt,
    }
  }, [stopWatching, stopNative, bodyWeightKg])

  const reset = useCallback(() => {
    if (usingNativeRef.current) { void stopNative() } else { stopWatching() }
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
    pauseStartRef.current = 0
    distanceRef.current = 0
    justResumedRef.current = false
    latestFixRef.current = null
  }, [stopWatching, stopNative])

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
      // Guard anti-zumbi: o cleanup do effect NÃO cancela o timer (ver comentário
      // abaixo), então um timer agendado enquanto corria pode disparar DEPOIS do
      // stop()+save+clearPersistedCardio(kvSet null) e regravar o cardio já
      // finalizado por cima do null — ressuscitando a corrida (banner "Retomar?"
      // fantasma + risco de duplicata no histórico se o usuário retomar e parar).
      // isTrackingRef continua true durante PAUSE, então persistência legítima de
      // pausa segue passando. Só o stop real (isTracking=false) bloqueia a escrita.
      if (!isTrackingRef.current) { idbDebounceRef.current = null; return }
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
    pauseStartRef.current = 0
    maxSpeedRef.current = recoveredMaxSpeed
    // Continua a distância de onde parou; o próximo fix é "ponte" (o usuário
    // pode ter se deslocado com o app morto — não conta esse trecho).
    distanceRef.current = Number(recoveredMetrics?.distanceMeters) || 0
    justResumedRef.current = true
    startedAtRef.current = recoveredStartedAtIso

    setTrackPoints(points)
    setMetrics(recoveredMetrics)
    setIsTracking(true)
    setIsPaused(false)
    setRecoveredCardio(null)
    if (isNativeCardioLocationAvailable() && (await startNative())) return
    await startWatching()
  }, [recoveredCardio, startWatching, startNative])

  const discardRecoveredCardio = useCallback(async () => {
    if (userId) await clearPersistedCardio(userId)
    setRecoveredCardio(null)
  }, [userId])

  const finalizePersistedCardio = useCallback(async () => {
    if (userId) await clearPersistedCardio(userId)
  }, [userId])

  // No path nativo o useGeoLocation fica dormente (position/status não atualizam) —
  // a precisão vem de metrics.accuracyMeters (setado pelo drain). Surfaça o status
  // pelo caminho ATIVO pra UI não travar em "Buscando GPS...".
  const hasReliableFix = usingNativeGps
    ? (metrics.accuracyMeters != null && metrics.accuracyMeters <= maxAccuracyMeters)
    : (!!position && position.accuracyMeters <= maxAccuracyMeters)

  const effectiveGpsStatus: TrackingStatus = usingNativeGps
    ? (isTracking ? (metrics.accuracyMeters != null ? 'watching' : 'acquiring') : 'idle')
    : gpsStatus

  return {
    isTracking,
    isPaused,
    metrics,
    trackPoints,
    gpsStatus: effectiveGpsStatus,
    gpsError,
    hasReliableFix,
    isBackgroundTracking: usingNativeGps,
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
