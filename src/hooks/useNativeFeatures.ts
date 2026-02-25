'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { isIosNative } from '@/utils/platform'
import {
  triggerHaptic,
  checkBiometricsAvailable,
  authenticateWithBiometrics,
  indexWorkoutInSpotlight,
  removeWorkoutFromSpotlight,
  clearAllWorkoutsFromSpotlight,
  startAccelerometer,
  stopAccelerometer,
  isHealthKitAvailable,
  requestHealthKitPermission,
  saveWorkoutToHealth,
  getHealthSteps,
  requestNativeNotifications,
  checkNativeNotificationPermission,
  setupNativeNotificationActions,
  type HapticStyle,
} from '@/utils/native/irontracksNative'

// ─── Types ───────────────────────────────────────────────────────────────────

export type AccelerometerData = {
  x: number
  y: number
  z: number
  timestamp: number
}

export type BiometryType = 'faceID' | 'touchID' | 'none'

export type NotificationPermissionStatus =
  | 'granted' | 'denied' | 'notDetermined' | 'provisional' | 'ephemeral' | 'unknown'

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * Centralised React hook for all iOS native capabilities.
 * Safe to call on any platform — all methods are no-ops on web.
 */
export function useNativeFeatures() {
  const isNative = isIosNative()
  const accelerometerCleanupRef = useRef<(() => void) | null>(null)
  const [healthKitAvailable, setHealthKitAvailable] = useState(false)

  // Check HealthKit availability once on mount
  useEffect(() => {
    if (!isNative) return
    isHealthKitAvailable().then(setHealthKitAvailable)
  }, [isNative])

  // ── Haptics ────────────────────────────────────────────────────────────────

  const haptic = useCallback((style: HapticStyle = 'medium') => {
    void triggerHaptic(style)
  }, [])

  // ── Biometrics ─────────────────────────────────────────────────────────────

  const getBiometryInfo = useCallback(async () => {
    return checkBiometricsAvailable()
  }, [])

  const authenticateBiometrics = useCallback(async (reason?: string) => {
    return authenticateWithBiometrics(reason)
  }, [])

  // ── Spotlight ──────────────────────────────────────────────────────────────

  const indexWorkout = useCallback(async (opts: {
    id: string
    title: string
    subtitle?: string
    dateMs?: number
  }) => {
    return indexWorkoutInSpotlight(opts)
  }, [])

  const removeWorkoutIndex = useCallback(async (id: string) => {
    return removeWorkoutFromSpotlight(id)
  }, [])

  const clearWorkoutIndex = useCallback(async () => {
    return clearAllWorkoutsFromSpotlight()
  }, [])

  // ── Accelerometer ──────────────────────────────────────────────────────────

  const startMotionTracking = useCallback(async (
    onData: (data: AccelerometerData) => void,
    intervalMs = 100,
  ) => {
    if (!isNative) return

    const { registerPlugin } = await import('@capacitor/core')
    // Listen for accelerometer events from the native plugin
    const plugin = registerPlugin('IronTracksNative') as {
      addListener: (event: string, cb: (data: AccelerometerData) => void) => Promise<{ remove: () => void }>
    }
    const handle = await plugin.addListener('accelerometerData', onData)

    await startAccelerometer(intervalMs)

    // Store cleanup
    accelerometerCleanupRef.current = () => {
      void stopAccelerometer()
      handle.remove()
    }
  }, [isNative])

  const stopMotionTracking = useCallback(() => {
    accelerometerCleanupRef.current?.()
    accelerometerCleanupRef.current = null
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      accelerometerCleanupRef.current?.()
    }
  }, [])

  // ── HealthKit ──────────────────────────────────────────────────────────────

  const requestHealthKit = useCallback(async () => {
    return requestHealthKitPermission()
  }, [])

  const saveWorkout = useCallback(async (opts: {
    startMs: number
    endMs: number
    calories?: number
  }) => {
    return saveWorkoutToHealth(opts)
  }, [])

  const fetchTodaySteps = useCallback(async () => {
    return getHealthSteps()
  }, [])

  // ── Notifications ──────────────────────────────────────────────────────────

  const requestNotificationPermission = useCallback(async () => {
    return requestNativeNotifications()
  }, [])

  const getNotificationPermission = useCallback(async (): Promise<NotificationPermissionStatus> => {
    const result = await checkNativeNotificationPermission()
    return result.status as NotificationPermissionStatus
  }, [])

  const setupNotificationActions = useCallback(async () => {
    return setupNativeNotificationActions()
  }, [])

  // ── Return ─────────────────────────────────────────────────────────────────

  return {
    isNative,
    healthKitAvailable,
    // Haptics
    haptic,
    // Biometrics
    getBiometryInfo,
    authenticateBiometrics,
    // Spotlight
    indexWorkout,
    removeWorkoutIndex,
    clearWorkoutIndex,
    // Motion
    startMotionTracking,
    stopMotionTracking,
    // HealthKit
    requestHealthKit,
    saveWorkout,
    fetchTodaySteps,
    // Notifications
    requestNotificationPermission,
    getNotificationPermission,
    setupNotificationActions,
  }
}
