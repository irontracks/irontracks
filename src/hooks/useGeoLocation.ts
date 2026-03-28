'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import type { GeoPoint } from '@/utils/geoUtils'

/** Geolocation permission state */
type PermissionState = 'prompt' | 'granted' | 'denied' | 'unavailable'

interface UseGeoLocationResult {
  /** Current position (null until first read) */
  position: GeoPoint | null
  /** Whether a position read is in progress */
  loading: boolean
  /** Last error message */
  error: string | null
  /** Current permission state */
  permission: PermissionState
  /** Request a one-shot position read */
  getCurrentPosition: () => Promise<GeoPoint | null>
  /** Start watching position (returns cleanup fn) */
  startWatching: () => void
  /** Stop watching position */
  stopWatching: () => void
  /** Whether actively watching */
  watching: boolean
}

/**
 * Try to dynamically import @capacitor/geolocation.
 * Returns null if not available (e.g. web, simulator without plugin).
 */
async function getCapacitorGeolocation() {
  try {
    const mod = await import('@capacitor/geolocation')
    return mod.Geolocation
  } catch {
    return null
  }
}

/**
 * Central geolocation hook. Works on both Capacitor (native) and web.
 * Uses @capacitor/geolocation on native, navigator.geolocation on web.
 * Safe in simulators — all Capacitor calls are wrapped in try/catch.
 */
export function useGeoLocation(): UseGeoLocationResult {
  const [position, setPosition] = useState<GeoPoint | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [permission, setPermission] = useState<PermissionState>('prompt')
  const [watching, setWatching] = useState(false)
  const watchIdRef = useRef<string | number | null>(null)
  const isNativeRef = useRef(false)

  // Detect if running on Capacitor native
  useEffect(() => {
    isNativeRef.current = typeof (window as unknown as Record<string, unknown>)?.Capacitor !== 'undefined'
  }, [])

  const checkPermission = useCallback(async (): Promise<PermissionState> => {
    try {
      if (isNativeRef.current) {
        const Geo = await getCapacitorGeolocation()
        if (!Geo) {
          // Plugin not available — fall through to web
          isNativeRef.current = false
        } else {
          const perm = await Geo.checkPermissions()
          const state = perm.location === 'granted' ? 'granted' : perm.location === 'denied' ? 'denied' : 'prompt'
          setPermission(state)
          return state
        }
      }
      // Web fallback
      if (!navigator.geolocation) {
        setPermission('unavailable')
        return 'unavailable'
      }
      if (navigator.permissions) {
        const result = await navigator.permissions.query({ name: 'geolocation' })
        const state = result.state === 'granted' ? 'granted' : result.state === 'denied' ? 'denied' : 'prompt'
        setPermission(state)
        return state
      }
      return 'prompt'
    } catch {
      return 'prompt'
    }
  }, [])

  const requestPermission = useCallback(async (): Promise<boolean> => {
    try {
      if (isNativeRef.current) {
        const Geo = await getCapacitorGeolocation()
        if (!Geo) {
          isNativeRef.current = false
          return true // fallback to web implicit permission
        }
        const perm = await Geo.requestPermissions()
        const granted = perm.location === 'granted'
        setPermission(granted ? 'granted' : 'denied')
        return granted
      }
      // On web, permission is requested implicitly when getting position
      return true
    } catch {
      setPermission('denied')
      return false
    }
  }, [])

  const getCurrentPosition = useCallback(async (): Promise<GeoPoint | null> => {
    setLoading(true)
    setError(null)
    try {
      const perm = await checkPermission()
      if (perm === 'denied' || perm === 'unavailable') {
        setError(perm === 'denied' ? 'Permissão de localização negada' : 'GPS não disponível')
        setLoading(false)
        return null
      }
      if (perm === 'prompt') {
        const ok = await requestPermission()
        if (!ok) {
          setError('Permissão de localização negada')
          setLoading(false)
          return null
        }
      }

      let point: GeoPoint | null = null

      if (isNativeRef.current) {
        const Geo = await getCapacitorGeolocation()
        if (Geo) {
          try {
            const pos = await Geo.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 })
            point = { latitude: pos.coords.latitude, longitude: pos.coords.longitude }
          } catch {
            // Native failed — try web fallback
            isNativeRef.current = false
          }
        }
      }

      if (!point && navigator.geolocation) {
        // Web fallback
        point = await new Promise<GeoPoint | null>((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
            () => resolve(null),
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
          )
        })
      }

      if (point) {
        setPosition(point)
        setPermission('granted')
      } else {
        setError('Não foi possível obter a localização')
      }
      setLoading(false)
      return point
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao obter localização')
      setLoading(false)
      return null
    }
  }, [checkPermission, requestPermission])

  const startWatching = useCallback(() => {
    if (watching) return

    const run = async () => {
      try {
        if (isNativeRef.current) {
          const Geo = await getCapacitorGeolocation()
          if (Geo) {
            try {
              const id = await Geo.watchPosition(
                { enableHighAccuracy: true, timeout: 15000 },
                (
                  pos: { coords: { latitude: number; longitude: number; altitude?: number | null; speed?: number | null } } | null,
                  err?: unknown,
                ) => {
                  if (err) return // silenced: GPS signal temporarily lost
                  if (pos) {
                    setPosition({
                      latitude: pos.coords.latitude,
                      longitude: pos.coords.longitude,
                    })
                  }
                }
              )
              watchIdRef.current = id
              setWatching(true)
              return
            } catch {
              // Native watch failed — fall through to web
              isNativeRef.current = false
            }
          }
        }

        // Web fallback
        if (navigator.geolocation) {
          const id = navigator.geolocation.watchPosition(
            (pos) => setPosition({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
            () => { /* intentional: silenced watch error */ },
            { enableHighAccuracy: true }
          )
          watchIdRef.current = id
          setWatching(true)
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erro ao iniciar tracking')
      }
    }
    run()
  }, [watching])

  const stopWatching = useCallback(() => {
    const run = async () => {
      try {
        if (watchIdRef.current !== null) {
          if (isNativeRef.current) {
            const Geo = await getCapacitorGeolocation()
            if (Geo) {
              try {
                await Geo.clearWatch({ id: String(watchIdRef.current) })
              } catch {
                // intentional: cleanup errors are non-critical
              }
            }
          } else if (navigator.geolocation && typeof watchIdRef.current === 'number') {
            navigator.geolocation.clearWatch(watchIdRef.current)
          }
          watchIdRef.current = null
        }
      } catch {
        // intentional: cleanup errors are non-critical
      }
      setWatching(false)
    }
    run()
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        if (typeof watchIdRef.current === 'number' && navigator.geolocation) {
          navigator.geolocation.clearWatch(watchIdRef.current)
        }
        watchIdRef.current = null
      }
    }
  }, [])

  return { position, loading, error, permission, getCurrentPosition, startWatching, stopWatching, watching }
}
