'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import GymSettingsSection from '@/components/settings/GymSettingsSection'

/**
 * Self-contained wrapper for GymSettingsSection that resolves
 * userId and supabase internally — no props needed.
 */
export default function GymSettingsWrapper() {
  const [supabase] = useState(() => createClient())
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.id) setUserId(data.user.id)
    })
  }, [supabase])

  if (!userId) return null

  return <GymSettingsSection userId={userId} supabase={supabase} />
}
