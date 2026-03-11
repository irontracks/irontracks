/**
 * @module useProfileCompletion
 *
 * Calculates a 0-100% profile completion score based on which fields
 * the user has filled in (display name, sex, weight, height, goals, etc.).
 * Powers the "Complete your profile" nudge banner and the badge on the header.
 *
 * @param userId       - Current user ID
 * @param displayName  - Current display name
 * @param settings     - Full user settings (for profile fields)
 * @returns `{ profileIncomplete, completionScore, missingFields, showCompleteProfile, ... }`
 */
'use client'

import { useState, useEffect, useMemo } from 'react'
import { getProfileCompletenessScore } from '@/schemas/settings'
import type { UserSettings } from '@/schemas/settings'

interface UseProfileCompletionOptions {
  userId?: string | null
  displayName?: string | null
  initialProfile?: unknown
  settings?: UserSettings | null
}

interface UseProfileCompletionReturn {
  profileIncomplete: boolean
  completionScore: number
  missingFields: string[]
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
 * Uses getProfileCompletenessScore to determine if profile is complete,
 * and exposes state + setters for the profile-completion modal.
 */
export function useProfileCompletion({
  userId,
  displayName,
  initialProfile,
  settings,
}: UseProfileCompletionOptions): UseProfileCompletionReturn {
  const [profileDraftName, setProfileDraftName] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [showCompleteProfile, setShowCompleteProfile] = useState(false)

  // Get completeness from settings (the real score)
  const { score, missingFields, isComplete } = useMemo(
    () => getProfileCompletenessScore(settings),
    [settings]
  )

  // Also check display name as a baseline (if no name = definitely incomplete)
  const [hasName, setHasName] = useState(false)

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      if (!userId) {
        if (!cancelled) {
          setHasName(false)
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
          setHasName(!!seedName)
          setProfileDraftName(seedName)
        }
      } catch {
        if (!cancelled) {
          setHasName(false)
          setProfileDraftName(String(displayName || '').trim())
        }
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [initialProfile, userId, displayName])

  // Profile is incomplete if score < 90 OR no display name
  const profileIncomplete = !isComplete || !hasName

  return {
    profileIncomplete,
    completionScore: score,
    missingFields,
    setProfileIncomplete: () => {}, // kept for backward compat
    profileDraftName,
    setProfileDraftName,
    savingProfile,
    setSavingProfile,
    showCompleteProfile,
    setShowCompleteProfile,
  }
}
