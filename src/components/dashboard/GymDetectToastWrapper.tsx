'use client'

import { useState, useEffect } from 'react'
import { useGymCheckin } from '@/hooks/useGymCheckin'
import { createClient } from '@/utils/supabase/client'
import GymDetectToast from '@/components/dashboard/GymDetectToast'

interface Props {
  userId: string | undefined
  onStartWorkout: () => void
}

/**
 * Wrapper that manages gym detection state and renders the toast.
 * Loads location settings and delegates to useGymCheckin.
 */
export default function GymDetectToastWrapper({ userId, onStartWorkout }: Props) {
  const [supabase] = useState(() => createClient())
  const [locationEnabled, setLocationEnabled] = useState(false)

  // Check if user has GPS enabled
  useEffect(() => {
    if (!userId) return
    supabase
      .from('user_location_settings')
      .select('gps_enabled, auto_checkin')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.gps_enabled) setLocationEnabled(true)
      })
  }, [userId, supabase])

  const checkin = useGymCheckin(userId, supabase, locationEnabled)

  if (!checkin.showToast || !checkin.detectedGym) return null

  return (
    <GymDetectToast
      gymName={checkin.detectedGym.name}
      distance={checkin.distanceToGym}
      onStartWorkout={() => {
        checkin.doCheckin()
        onStartWorkout()
      }}
      onCheckin={() => checkin.doCheckin()}
      onDismiss={() => checkin.dismiss()}
      loading={checkin.loading}
    />
  )
}
