'use client'

import { useState, useEffect } from 'react'

interface UseProfileCompletionOptions {
  userId?: string | null
  displayName?: string | null
  initialProfile?: unknown
}

interface UseProfileCompletionReturn {
  profileIncomplete: boolean
  setProfileIncomplete: (v: boolean) => void
  profileDraftName: string
  setProfileDraftName: (v: string) => void
  savingProfile: boolean
  setSavingProfile: (v: boolean) => void
  showCompleteProfile: boolean
  setShowCompleteProfile: (v: boolean) => void
}

/**
 * Manages the "complete your profile" prompt state.
 * Automatically detects whether the user's display_name is missing
 * and exposes state + setters for the profile-completion modal.
 */
export function useProfileCompletion({
  userId,
  displayName,
  initialProfile,
}: UseProfileCompletionOptions): UseProfileCompletionReturn {
  const [profileIncomplete, setProfileIncomplete] = useState(false)
  const [profileDraftName, setProfileDraftName] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [showCompleteProfile, setShowCompleteProfile] = useState(false)

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      if (!userId) {
        if (!cancelled) {
          setProfileIncomplete(false)
          setProfileDraftName('')
        }
        return
      }

      try {
        const profileObj =
          initialProfile && typeof initialProfile === 'object'
            ? (initialProfile as Record<string, unknown>)
            : {}
        const seedName =
          String(profileObj?.display_name || '').trim() || String(displayName || '').trim()

        if (!cancelled) {
          setProfileIncomplete(!seedName)
          setProfileDraftName(seedName)
        }
      } catch {
        if (!cancelled) {
          setProfileIncomplete(true)
          setProfileDraftName(String(displayName || '').trim())
        }
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [initialProfile, userId, displayName])

  return {
    profileIncomplete,
    setProfileIncomplete,
    profileDraftName,
    setProfileDraftName,
    savingProfile,
    setSavingProfile,
    showCompleteProfile,
    setShowCompleteProfile,
  }
}
