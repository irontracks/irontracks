/**
 * useHealthKit
 *
 * Manages Apple Health integration state for iOS native.
 * - Requests HealthKit permission when appleHealthSync is enabled
 * - Exposes steps, heart rate, resting HR, HRV and active calories
 * - Data is fetched once on mount and on workout finish (via refetch)
 * - No-ops on web / Android
 */
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  isHealthKitAvailable,
  requestHealthKitPermission,
  getHealthSteps,
  getHeartRate,
  getRestingHeartRate,
  getHRV,
  getActiveCalories,
} from '@/utils/native/irontracksNative'

export interface HealthKitData {
  steps: number
  heartRateBpm: number
  heartRateTimestamp: number
  restingHeartRateBpm: number
  activeCalories: number
  sdnn: number           // HRV (ms)
}

const EMPTY: HealthKitData = {
  steps: 0,
  heartRateBpm: 0,
  heartRateTimestamp: 0,
  restingHeartRateBpm: 0,
  activeCalories: 0,
  sdnn: 0,
}

interface UseHealthKitOptions {
  enabled: boolean      // matches settings.appleHealthSync
  userId?: string | null
}

export function useHealthKit({ enabled, userId }: UseHealthKitOptions) {
  const [available, setAvailable] = useState(false)
  const [permissionGranted, setPermissionGranted] = useState(false)
  const [data, setData] = useState<HealthKitData>(EMPTY)
  const fetchedRef = useRef(false)
  const permissionKeyBase = 'irontracks.healthkit.permission.v1'
  const permissionKey = userId ? `${permissionKeyBase}.${userId}` : permissionKeyBase

  // Check availability once
  useEffect(() => {
    isHealthKitAvailable().then(setAvailable).catch(() => setAvailable(false))
  }, [])

  // Request permission when enabled is toggled on and HealthKit is available
  useEffect(() => {
    if (!available || !enabled) return

    // Check cached permission state
    try {
      if (localStorage.getItem(permissionKey) === '1') {
        setPermissionGranted(true)
        return
      }
    } catch { /* ignore */ }

    requestHealthKitPermission().then(({ granted }) => {
      setPermissionGranted(granted)
      if (granted) {
        try { localStorage.setItem(permissionKey, '1') } catch { /* ignore */ }
      }
    }).catch(() => setPermissionGranted(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available, enabled])

  const fetchData = useCallback(async () => {
    if (!available || !enabled || !permissionGranted) return
    try {
      const [steps, hr, rhr, hrv, cals] = await Promise.all([
        getHealthSteps(),
        getHeartRate(),
        getRestingHeartRate(),
        getHRV(),
        getActiveCalories(),
      ])
      setData({
        steps,
        heartRateBpm: hr.bpm,
        heartRateTimestamp: hr.timestamp,
        restingHeartRateBpm: rhr.bpm,
        activeCalories: cals,
        sdnn: hrv.sdnn,
      })
    } catch { /* silently fail — health data is supplemental */ }
  }, [available, enabled, permissionGranted])

  // Fetch once when permission is granted
  useEffect(() => {
    if (!permissionGranted || fetchedRef.current) return
    fetchedRef.current = true
    void fetchData()
  }, [permissionGranted, fetchData])

  return {
    available,
    permissionGranted,
    data,
    refetch: fetchData,
  }
}
