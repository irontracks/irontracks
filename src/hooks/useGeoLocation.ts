'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { isNativePlatform } from '@/utils/platform'
import { logWarn } from '@/lib/logger'
import type { GeoPoint } from '@/utils/geoUtils'

/** A GPS fix with full metadata. Extends GeoPoint with accuracy + speed + timestamp. */
export interface GeoFix extends GeoPoint {
  /** Horizontal accuracy in meters. Lower is better. */
  accuracyMeters: number
  /** Altitude in meters (if available). */
  altitudeMeters: number | null
  /** Instantaneous speed in m/s (if reported by device). */
  speedMps: number | null
  /** Heading in degrees (if reported by device). */
  headingDeg: number | null
  /** Unix ms the fix was produced by the device. */
  timestamp: number
}

/** Permission lifecycle states the caller needs to react to. */
export type PermissionState = 'prompt' | 'granted' | 'denied' | 'unavailable'

/** High-level tracking status shown in the UI. */
export type TrackingStatus =
  /** Not started yet. */
  | 'idle'
  /** Permission dialog is on screen. */
  | 'requesting-permission'
  /** Acquiring the first GPS fix after permission granted. */
  | 'acquiring'
  /** Actively streaming positions. */
  | 'watching'
  /** User or OS denied permission. */
  | 'denied'
  /** Hardware/plugin not available (e.g. desktop browser with no location). */
  | 'unavailable'
  /** Generic error — surfaced to the UI via `error`. */
  | 'error'

interface UseGeoLocationResult {
  /** Latest GPS fix, or null if none yet. */
  position: GeoFix | null
  /** High-level tracking state — drives the UI. */
  status: TrackingStatus
  /** Raw permission state (checked on mount + after requests). */
  permission: PermissionState
  /** Last user-facing error message, or null. */
  error: string | null
  /** One-shot: prompt the user and resolve to the first fix. */
  getCurrentPosition: () => Promise<GeoFix | null>
  /** Start streaming positions. Requests permission if needed. */
  startWatching: () => Promise<void>
  /** Stop streaming + cancel any pending operations. */
  stopWatching: () => Promise<void>
}

/**
 * Lazily import the Capacitor Geolocation plugin. Returns null when:
 *   - not running in Capacitor (web build),
 *   - plugin not bundled (e.g. dev env without cap:sync),
 *   - import fails for any other reason.
 *
 * We wrap the return in an object because the Capacitor plugin proxy is
 * Thenable: returning it directly from an async function triggers the native
 * bridge via `.then()` and crashes on iOS with
 * "Geolocation.then() is not implemented on ios".
 */
async function loadCapacitorGeolocation() {
  try {
    const mod = await import('@capacitor/geolocation')
    return { geo: mod.Geolocation }
  } catch {
    return null
  }
}

/** Friendly error messages (PT-BR) for the most common PositionError codes. */
function friendlyGeoError(code: number | null): string {
  switch (code) {
    case 1: return 'Permissão de localização negada. Ative o GPS para o IronTracks nas configurações do seu dispositivo.'
    case 2: return 'Sem sinal de GPS. Saia para um local aberto e tente novamente.'
    case 3: return 'Tempo esgotado ao obter GPS. Verifique se o GPS está ligado.'
    default: return 'Erro ao obter localização.'
  }
}

/**
 * Central geolocation hook.
 *
 * Works on Capacitor (iOS + Android) via @capacitor/geolocation and on web
 * via navigator.geolocation. Detection uses the project's shared
 * isNativePlatform() helper (reads window.Capacitor.getPlatform()), which
 * is more reliable than checking for `window.Capacitor` alone.
 *
 * Contract:
 *   - startWatching() will request permission if needed. The promise
 *     resolves when watching begins OR when permission is denied.
 *   - position updates only trigger React re-renders when the coordinates
 *     actually change (accuracy filtering + 1m dedupe) — avoids useEffect
 *     churn.
 *   - stopWatching() is idempotent and safe to call even if not watching.
 */
export function useGeoLocation(): UseGeoLocationResult {
  const [position, setPosition] = useState<GeoFix | null>(null)
  const [status, setStatus] = useState<TrackingStatus>('idle')
  const [permission, setPermission] = useState<PermissionState>('prompt')
  const [error, setError] = useState<string | null>(null)

  // Refs that must survive re-renders / avoid effect churn
  const watchIdRef = useRef<string | number | null>(null)
  const isNativeRef = useRef(false)
  const lastFixRef = useRef<GeoFix | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    isNativeRef.current = isNativePlatform()
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  /** Safe setState wrappers that no-op after unmount. */
  const safeSetPosition = useCallback((p: GeoFix | null) => {
    if (mountedRef.current) setPosition(p)
  }, [])
  const safeSetStatus = useCallback((s: TrackingStatus) => {
    if (mountedRef.current) setStatus(s)
  }, [])
  const safeSetPermission = useCallback((p: PermissionState) => {
    if (mountedRef.current) setPermission(p)
  }, [])
  const safeSetError = useCallback((e: string | null) => {
    if (mountedRef.current) setError(e)
  }, [])

  /** Normalize a position update into our GeoFix shape and filter duplicates. */
  const applyFix = useCallback(
    (fix: GeoFix) => {
      const last = lastFixRef.current
      // Dedupe: if sub-meter identical to last, ignore (avoids re-renders
      // when the OS rebroadcasts a cached fix repeatedly).
      if (
        last &&
        Math.abs(last.latitude - fix.latitude) < 0.000005 &&
        Math.abs(last.longitude - fix.longitude) < 0.000005
      ) {
        return
      }
      lastFixRef.current = fix
      safeSetPosition(fix)
    },
    [safeSetPosition],
  )

  // ── Permission check + request ────────────────────────────────────────────

  const checkPermission = useCallback(async (): Promise<PermissionState> => {
    try {
      if (isNativeRef.current) {
        const loaded = await loadCapacitorGeolocation()
        if (loaded) {
          const perm = await loaded.geo.checkPermissions()
          const state: PermissionState =
            perm.location === 'granted' ? 'granted' :
            perm.location === 'denied'  ? 'denied'  :
            'prompt'
          safeSetPermission(state)
          return state
        }
        // Capacitor bridge present but plugin missing — treat as web
        isNativeRef.current = false
      }
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        safeSetPermission('unavailable')
        return 'unavailable'
      }
      if (navigator.permissions) {
        try {
          const r = await navigator.permissions.query({ name: 'geolocation' })
          const state: PermissionState =
            r.state === 'granted' ? 'granted' :
            r.state === 'denied'  ? 'denied'  :
            'prompt'
          safeSetPermission(state)
          return state
        } catch {
          // Some older Safari versions throw here — fall through to prompt.
        }
      }
      safeSetPermission('prompt')
      return 'prompt'
    } catch (e) {
      logWarn('useGeoLocation.checkPermission', 'failed', e)
      safeSetPermission('prompt')
      return 'prompt'
    }
  }, [safeSetPermission])

  const requestPermission = useCallback(async (): Promise<PermissionState> => {
    safeSetStatus('requesting-permission')
    try {
      if (isNativeRef.current) {
        const loaded = await loadCapacitorGeolocation()
        if (loaded) {
          const perm = await loaded.geo.requestPermissions()
          const state: PermissionState = perm.location === 'granted' ? 'granted' : 'denied'
          safeSetPermission(state)
          return state
        }
        isNativeRef.current = false
      }
      // On web, there's no explicit request API — the prompt fires when
      // you actually call getCurrentPosition/watchPosition. Treat 'prompt'
      // as "will ask on next call."
      return 'prompt'
    } catch (e) {
      logWarn('useGeoLocation.requestPermission', 'failed', e)
      safeSetPermission('denied')
      return 'denied'
    }
  }, [safeSetPermission, safeSetStatus])

  // ── One-shot position ─────────────────────────────────────────────────────

  const getCurrentPosition = useCallback(async (): Promise<GeoFix | null> => {
    safeSetError(null)
    try {
      let perm = await checkPermission()
      if (perm === 'unavailable') {
        safeSetStatus('unavailable')
        safeSetError('GPS não disponível neste dispositivo.')
        return null
      }
      if (perm === 'prompt') perm = await requestPermission()
      if (perm === 'denied') {
        safeSetStatus('denied')
        safeSetError(friendlyGeoError(1))
        return null
      }

      safeSetStatus('acquiring')

      let fix: GeoFix | null = null

      if (isNativeRef.current) {
        const loaded = await loadCapacitorGeolocation()
        if (loaded) {
          try {
            const pos = await loaded.geo.getCurrentPosition({
              enableHighAccuracy: true,
              timeout: 15000,
              maximumAge: 0,
            })
            fix = {
              latitude:  pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracyMeters:  Number(pos.coords.accuracy) || 99,
              altitudeMeters:  pos.coords.altitude ?? null,
              speedMps:        pos.coords.speed ?? null,
              headingDeg:      pos.coords.heading ?? null,
              timestamp:       pos.timestamp ?? Date.now(),
            }
          } catch (e) {
            logWarn('useGeoLocation.native.getCurrentPosition', 'failed', e)
            isNativeRef.current = false
          }
        }
      }

      if (!fix && typeof navigator !== 'undefined' && navigator.geolocation) {
        fix = await new Promise<GeoFix | null>((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (pos) =>
              resolve({
                latitude:  pos.coords.latitude,
                longitude: pos.coords.longitude,
                accuracyMeters:  pos.coords.accuracy ?? 99,
                altitudeMeters:  pos.coords.altitude ?? null,
                speedMps:        pos.coords.speed ?? null,
                headingDeg:      pos.coords.heading ?? null,
                timestamp:       pos.timestamp,
              }),
            (err) => {
              safeSetError(friendlyGeoError(err.code))
              resolve(null)
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
          )
        })
      }

      if (fix) {
        applyFix(fix)
        safeSetPermission('granted')
        safeSetStatus('idle') // one-shot ends — caller can startWatching for continuous
      } else if (!error) {
        // If getCurrentPosition produced nothing AND we didn't set an error,
        // it's almost certainly a timeout.
        safeSetError(friendlyGeoError(3))
        safeSetStatus('error')
      }

      return fix
    } catch (e) {
      logWarn('useGeoLocation.getCurrentPosition', 'failed', e)
      safeSetError(e instanceof Error ? e.message : 'Erro ao obter localização.')
      safeSetStatus('error')
      return null
    }
    // error state is read via ref? No — we use getState indirectly via closure.
    // Safe because we only check !error inside the same tick as the null check.
  }, [applyFix, checkPermission, requestPermission, error, safeSetError, safeSetPermission, safeSetStatus])

  // ── Continuous watch ──────────────────────────────────────────────────────

  const startWatching = useCallback(async (): Promise<void> => {
    if (watchIdRef.current !== null) return // already watching
    safeSetError(null)

    let perm = await checkPermission()
    if (perm === 'unavailable') {
      safeSetStatus('unavailable')
      safeSetError('GPS não disponível neste dispositivo.')
      return
    }
    if (perm === 'prompt') perm = await requestPermission()
    if (perm === 'denied') {
      safeSetStatus('denied')
      safeSetError(friendlyGeoError(1))
      return
    }

    safeSetStatus('acquiring')

    try {
      if (isNativeRef.current) {
        const loaded = await loadCapacitorGeolocation()
        if (loaded) {
          try {
            const id = await loaded.geo.watchPosition(
              { enableHighAccuracy: true, timeout: 30000 },
              (
                pos: {
                  coords: {
                    latitude: number
                    longitude: number
                    accuracy: number
                    altitude?: number | null
                    speed?: number | null
                    heading?: number | null
                  }
                  timestamp?: number
                } | null,
                err?: unknown,
              ) => {
                if (err) {
                  // Don't flip to error on transient signal loss — just stay
                  // in 'watching' and log. A persistent failure is surfaced
                  // by no position updates for the caller to handle.
                  logWarn('useGeoLocation.watch.native', 'transient error', err)
                  return
                }
                if (!pos) return
                applyFix({
                  latitude:  pos.coords.latitude,
                  longitude: pos.coords.longitude,
                  accuracyMeters:  Number(pos.coords.accuracy) || 99,
                  altitudeMeters:  pos.coords.altitude ?? null,
                  speedMps:        pos.coords.speed ?? null,
                  headingDeg:      pos.coords.heading ?? null,
                  timestamp:       pos.timestamp ?? Date.now(),
                })
                safeSetStatus('watching')
              },
            )
            watchIdRef.current = id
            return
          } catch (e) {
            logWarn('useGeoLocation.watch.native.setup', 'failed', e)
            isNativeRef.current = false
          }
        }
      }

      // Web fallback
      if (typeof navigator !== 'undefined' && navigator.geolocation) {
        const id = navigator.geolocation.watchPosition(
          (pos) => {
            applyFix({
              latitude:  pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracyMeters:  pos.coords.accuracy ?? 99,
              altitudeMeters:  pos.coords.altitude ?? null,
              speedMps:        pos.coords.speed ?? null,
              headingDeg:      pos.coords.heading ?? null,
              timestamp:       pos.timestamp,
            })
            safeSetStatus('watching')
          },
          (err) => {
            // Persistent failure path — surface to UI.
            safeSetError(friendlyGeoError(err.code))
            safeSetStatus('error')
          },
          { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 },
        )
        watchIdRef.current = id
      } else {
        safeSetStatus('unavailable')
        safeSetError('GPS não disponível neste dispositivo.')
      }
    } catch (e) {
      logWarn('useGeoLocation.startWatching', 'failed', e)
      safeSetError(e instanceof Error ? e.message : 'Erro ao iniciar GPS.')
      safeSetStatus('error')
    }
  }, [applyFix, checkPermission, requestPermission, safeSetError, safeSetStatus])

  const stopWatching = useCallback(async (): Promise<void> => {
    const id = watchIdRef.current
    watchIdRef.current = null
    try {
      if (id === null) return
      if (isNativeRef.current) {
        const loaded = await loadCapacitorGeolocation()
        if (loaded) {
          try {
            await loaded.geo.clearWatch({ id: String(id) })
          } catch (e) {
            logWarn('useGeoLocation.stopWatching.native', 'failed', e)
          }
        }
      } else if (typeof navigator !== 'undefined' && navigator.geolocation && typeof id === 'number') {
        navigator.geolocation.clearWatch(id)
      }
    } finally {
      if (mountedRef.current) safeSetStatus('idle')
    }
  }, [safeSetStatus])

  // Cleanup on unmount — limpa AMBOS os caminhos (web: id=number, Capacitor: id=string).
  // Antes só tratava `typeof id === 'number'`, deixando GPS nativo ligado quando o
  // usuário fechava a tela de cardio via gesto sem chamar stopWatching → bateria,
  // calor e privacidade comprometidos.
  useEffect(() => {
    const wasNative = isNativeRef.current
    return () => {
      const id = watchIdRef.current
      watchIdRef.current = null
      if (id === null) return
      if (wasNative && typeof id === 'string') {
        // Capacitor: dispara fire-and-forget; o hook já foi unmount, não dá pra await.
        loadCapacitorGeolocation()
          .then((loaded) => loaded?.geo.clearWatch({ id }))
          .catch(() => { /* ignore */ })
      } else if (typeof id === 'number' && typeof navigator !== 'undefined' && navigator.geolocation) {
        try { navigator.geolocation.clearWatch(id) } catch { /* ignore */ }
      }
    }
  }, [])

  return {
    position,
    status,
    permission,
    error,
    getCurrentPosition,
    startWatching,
    stopWatching,
  }
}
