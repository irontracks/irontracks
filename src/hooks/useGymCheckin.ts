'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useGeoLocation } from './useGeoLocation'
import { isWithinRadius, findNearestGym } from '@/utils/geoUtils'
import type { GeoPoint } from '@/utils/geoUtils'

interface Gym {
  id: string
  name: string
  latitude: number
  longitude: number
  radius_meters: number
  is_primary: boolean
}

interface GymCheckinState {
  /** Detected gym (null if not near any) */
  detectedGym: Gym | null
  /** Distance to detected gym in meters */
  distanceToGym: number | null
  /** Whether check-in was already performed this session */
  checkedIn: boolean
  /** Loading state */
  loading: boolean
  /** Perform check-in for the detected gym */
  doCheckin: (workoutId?: string) => Promise<boolean>
  /** Dismiss the auto-detect toast */
  dismiss: () => void
  /** Whether the toast should be shown */
  showToast: boolean
  /** Refresh gym detection (re-read GPS) */
  refresh: () => Promise<void>
}

/**
 * Auto-detect gym and manage check-ins.
 * Only runs if user has gps_enabled + auto_checkin in settings.
 */
export function useGymCheckin(
  userId: string | undefined,
  supabase: ReturnType<typeof import('@/utils/supabase/client').createClient> | null,
  locationEnabled: boolean,
): GymCheckinState {
  const { position, getCurrentPosition } = useGeoLocation()
  const [gyms, setGyms] = useState<Gym[]>([])
  const [detectedGym, setDetectedGym] = useState<Gym | null>(null)
  const [distanceToGym, setDistanceToGym] = useState<number | null>(null)
  const [checkedIn, setCheckedIn] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showToast, setShowToast] = useState(false)
  const hasCheckedRef = useRef(false)

  // Load user gyms
  useEffect(() => {
    if (!userId || !supabase || !locationEnabled) return
    const load = async () => {
      const { data } = await supabase
        .from('user_gyms')
        .select('id, name, latitude, longitude, radius_meters, is_primary')
        .eq('user_id', userId)
        .limit(20)
      if (data) setGyms(data as Gym[])
    }
    load()
  }, [userId, supabase, locationEnabled])

  // Detect gym when position changes
  useEffect(() => {
    if (!position || gyms.length === 0 || hasCheckedRef.current) return

    const nearest = findNearestGym(position, gyms)
    if (nearest && isWithinRadius(position, nearest.gym, nearest.gym.radius_meters)) {
      setDetectedGym(nearest.gym)
      setDistanceToGym(Math.round(nearest.distance))
      setShowToast(true)
      hasCheckedRef.current = true
    }
  }, [position, gyms])

  // Auto-detect on mount
  useEffect(() => {
    if (!locationEnabled || gyms.length === 0 || hasCheckedRef.current) return
    getCurrentPosition()
  }, [locationEnabled, gyms.length, getCurrentPosition])

  const doCheckin = useCallback(async (workoutId?: string): Promise<boolean> => {
    if (!supabase || !userId || !detectedGym || !position) return false
    setLoading(true)
    try {
      const { error } = await supabase.from('gym_checkins').insert({
        user_id: userId,
        gym_id: detectedGym.id,
        workout_id: workoutId || null,
        latitude: position.latitude,
        longitude: position.longitude,
      })
      if (!error) {
        setCheckedIn(true)
        setShowToast(false)
        return true
      }
      return false
    } catch {
      return false
    } finally {
      setLoading(false)
    }
  }, [supabase, userId, detectedGym, position])

  const dismiss = useCallback(() => {
    setShowToast(false)
  }, [])

  const refresh = useCallback(async () => {
    hasCheckedRef.current = false
    setDetectedGym(null)
    setDistanceToGym(null)
    setShowToast(false)
    await getCurrentPosition()
  }, [getCurrentPosition])

  return { detectedGym, distanceToGym, checkedIn, loading, doCheckin, dismiss, showToast, refresh }
}
