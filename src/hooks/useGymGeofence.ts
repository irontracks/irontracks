/**
 * useGymGeofence
 *
 * Reads the user's favourite gym from `user_settings.preferences.favoriteGym`
 * and (re)registers the iOS CLCircularRegion accordingly. When the geofence
 * fires while the app is in memory, calls onEntered so the dashboard can
 * surface a CTA ("Iniciar treino aqui?"). When the app is killed, the native
 * plugin posts a local notification — same UX, no JS needed.
 *
 * Coords + name live in the JSON `preferences` blob (no schema migration
 * required) and are pushed into Swift UserDefaults via the start call.
 */
'use client'

import { useEffect, useRef } from 'react'
import {
  addGymGeofenceListener,
  checkGeofenceStatus,
  startGymGeofence,
  stopGymGeofence,
} from '@/utils/native/irontracksNative'
import { isIosNative } from '@/utils/platform'

export interface FavoriteGym {
  name: string
  lat: number
  lng: number
  /** Optional override — defaults to 120 m. Clamped 50–500 m by the native side. */
  radius?: number
}

interface UseGymGeofenceArgs {
  /** Favourite gym (null disables / removes the geofence). */
  favoriteGym: FavoriteGym | null
  /** Whether the user has opted into auto check-in (settings toggle). */
  enabled: boolean
  /** Fires when iOS detects entry while app is running. Called once per 4 h. */
  onEntered?: (gymName: string) => void
}

export function useGymGeofence({ favoriteGym, enabled, onEntered }: UseGymGeofenceArgs): void {
  const lastSignatureRef = useRef<string>('')

  useEffect(() => {
    if (!isIosNative()) return

    let cancelled = false
    const sig = enabled && favoriteGym
      ? `${favoriteGym.name}|${favoriteGym.lat}|${favoriteGym.lng}|${favoriteGym.radius ?? 120}`
      : 'OFF'
    if (sig === lastSignatureRef.current) return
    lastSignatureRef.current = sig

    void (async () => {
      if (!enabled || !favoriteGym) {
        await stopGymGeofence()
        return
      }
      // Refuse silently if permission isn't `authorizedAlways` — caller is
      // responsible for prompting via requestAlwaysLocationPermission.
      const status = await checkGeofenceStatus()
      if (cancelled) return
      if (status.authorization !== 'authorizedAlways') {
        // Best-effort: still register the region with whenInUse so it kicks
        // in once the user upgrades. iOS allows this but only fires while
        // the app is in foreground.
      }
      await startGymGeofence({
        lat: favoriteGym.lat,
        lng: favoriteGym.lng,
        radius: favoriteGym.radius,
        name: favoriteGym.name,
      })
    })()

    return () => { cancelled = true }
  }, [favoriteGym, enabled])

  useEffect(() => {
    if (!isIosNative() || !onEntered) return
    const unsubscribe = addGymGeofenceListener((name) => {
      try { onEntered(name) } catch { /* swallow */ }
    })
    return () => { try { unsubscribe() } catch { /* swallow */ } }
  }, [onEntered])
}
