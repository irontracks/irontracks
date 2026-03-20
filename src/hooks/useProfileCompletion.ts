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

import { useState, useEffect, useMemo, useCallback } from 'react'
import { getProfileCompletenessScore } from '@/schemas/settings'
import { createClient } from '@/utils/supabase/client'
import type { UserSettings } from '@/schemas/settings'

interface UseProfileCompletionOptions {
  userId?: string | null
  displayName?: string | null
  initialProfile?: unknown
  settings?: UserSettings | null
  user?: { id?: string; photoURL?: string | null } | null
  alert?: (msg: string, title?: string) => Promise<unknown>
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
  handleSaveProfile: () => Promise<void>
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
  user,
  alert: alertFn,
}: UseProfileCompletionOptions): UseProfileCompletionReturn {
  const supabase = createClient()
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

  const handleSaveProfile = useCallback(async () => {
    if (!userId) return
    const nextName = String(profileDraftName || '').trim()
    if (!nextName) {
      if (alertFn) await alertFn('Informe seu nome para completar o perfil.', 'Perfil incompleto')
      return
    }
    setSavingProfile(true)
    try {
      const { data, error } = await supabase
        .from('profiles')
        .update({
          display_name: nextName,
          photo_url: user?.photoURL ?? null,
          last_seen: new Date().toISOString(),
        })
        .eq('id', userId)
        .select('id')
        .maybeSingle()
      if (error) throw error
      if (!data?.id) {
        if (alertFn) await alertFn('Não foi possível salvar seu perfil (registro não encontrado).', 'Perfil')
        return
      }
      setShowCompleteProfile(false)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e || '')
      if (alertFn) await alertFn('Erro ao salvar perfil: ' + message)
    } finally {
      setSavingProfile(false)
    }
  }, [userId, profileDraftName, user?.photoURL, alertFn, supabase])

  return {
    profileIncomplete,
    completionScore: score,
    missingFields,
    setProfileIncomplete: () => {},
    profileDraftName,
    setProfileDraftName,
    savingProfile,
    setSavingProfile,
    showCompleteProfile,
    setShowCompleteProfile,
    handleSaveProfile,
  }
}
